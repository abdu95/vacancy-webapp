"""Browser sign-in (Sign in with Google) and the account endpoints the web
version's sign-in, onboarding and profile screens use. The Telegram Mini
App never calls the sign-in endpoints - it authenticates every request with
initData - but /api/me and /api/waitlist work for both kinds of user."""

import logging
import os
import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request, Response
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel

from app import db
from app.auth import SESSION_COOKIE, authenticate, check_same_origin

logger = logging.getLogger(__name__)
router = APIRouter()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
_google_request = google_requests.Request()

# Per-IP cap on sign-in attempts. In-process (one uvicorn worker), so it
# resets on deploy - it's a brake on scripted abuse, not an account lockout.
_SIGNIN_LIMIT = 20
_SIGNIN_WINDOW_S = 600
_signin_attempts: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    # Railway's proxy puts the real client first in X-Forwarded-For.
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def _rate_limit(request: Request) -> None:
    now = time.monotonic()
    attempts = _signin_attempts[_client_ip(request)]
    while attempts and now - attempts[0] > _SIGNIN_WINDOW_S:
        attempts.popleft()
    if len(attempts) >= _SIGNIN_LIMIT:
        raise HTTPException(429, "Too many sign-in attempts - try again in a few minutes")
    attempts.append(now)


def _is_local(request: Request) -> bool:
    return (request.headers.get("host") or "").split(":")[0] in ("localhost", "127.0.0.1")


def verify_google_credential(credential: str) -> dict:
    """Checks the Google ID token's signature, expiry, issuer and that it
    was issued for our client id; returns its claims. Raises 401 on any
    failure. Separate function so tests can stand in for Google."""
    try:
        claims = id_token.verify_oauth2_token(credential, _google_request, GOOGLE_CLIENT_ID)
    except ValueError as e:
        logger.info("Rejected Google credential: %s", e)
        raise HTTPException(401, "Google sign-in failed - please try again")
    if not claims.get("email_verified"):
        raise HTTPException(401, "Your Google account's email isn't verified")
    return claims


@router.get("/api/web-config")
async def web_config():
    """Public settings the browser needs before anyone is signed in."""
    return {"google_client_id": GOOGLE_CLIENT_ID, "web_free_limit": db.WEB_FREE_LIMIT}


class GoogleSignInRequest(BaseModel):
    credential: str


@router.post("/api/auth/google")
async def google_sign_in(req: GoogleSignInRequest, request: Request, response: Response):
    check_same_origin(request)
    _rate_limit(request)
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(500, "Google sign-in is not configured")
    claims = verify_google_credential(req.credential)
    user_id, created = db.upsert_google_user(claims["sub"], claims.get("email"), claims.get("given_name"))
    token = db.create_session(user_id)
    response.set_cookie(
        SESSION_COOKIE, token, max_age=db.web_accounts.SESSION_DAYS * 86400,
        httponly=True, samesite="lax", secure=not _is_local(request), path="/",
    )
    account = db.get_account(user_id)
    db.log_event(user_id, "web_sign_in", {"new": created})
    return {"needs_onboarding": account["language"] is None, "name": account["name"]}


class AccountRequest(BaseModel):
    init_data: str = ""


@router.post("/api/me")
async def me(req: AccountRequest, request: Request):
    user = authenticate(req.init_data, request)
    account = db.get_account(user["user_id"])
    return {**account, "needs_onboarding": account["language"] is None}


class OnboardingRequest(BaseModel):
    init_data: str = ""
    name: str
    language: str


@router.post("/api/onboarding")
async def onboarding(req: OnboardingRequest, request: Request):
    user = authenticate(req.init_data, request)
    name = req.name.strip()
    if not 1 <= len(name) <= 60:
        raise HTTPException(400, "Please enter your name (up to 60 characters)")
    if req.language not in db.web_accounts.VALID_LANGUAGES:
        raise HTTPException(400, "Unsupported language")
    db.complete_onboarding(user["user_id"], name, req.language)
    return {"ok": True}


@router.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    check_same_origin(request)
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        db.delete_session(token)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


class WaitlistRequest(BaseModel):
    init_data: str = ""


@router.post("/api/waitlist")
async def waitlist(req: WaitlistRequest, request: Request):
    user = authenticate(req.init_data, request)
    newly = db.join_waitlist(user["user_id"])
    if newly:
        db.log_event(user["user_id"], "joined_waitlist", {"channel": user["channel"]})
    return {"joined": True, "already": not newly}
