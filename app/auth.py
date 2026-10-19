"""
Who is calling: a Telegram Mini App user (signed initData) or a browser
user signed in with Google (session cookie). Shared by every app/routes/*
module. Split out of app/main.py during the routes/db package split
(2026-09-07) - every router needs authenticate()/verify_init_data(), so
this couldn't live inside any single feature's route file.
"""

import hashlib
import hmac
import json
import os
from urllib.parse import parse_qsl, urlparse

from fastapi import HTTPException, Request

from app import db

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
SESSION_COOKIE = "chashma_session"


def verify_init_data(init_data: str) -> dict:
    """Validate Telegram Mini App initData per Telegram's documented scheme
    (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
    and return the parsed fields. Raises HTTPException if invalid."""
    if not TELEGRAM_TOKEN:
        raise HTTPException(500, "TELEGRAM_TOKEN not configured")

    parsed = dict(parse_qsl(init_data, strict_parsing=True))
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise HTTPException(401, "Missing hash in initData")

    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
    secret_key = hmac.new(b"WebAppData", TELEGRAM_TOKEN.encode(), hashlib.sha256).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        raise HTTPException(401, "Invalid initData signature")

    return parsed


def authenticate(init_data: str, request: Request | None = None) -> dict:
    """The calling user, as a dict with "user_id" (the internal users.id
    every app/db function takes), "id" (Telegram id, None for browser
    users - only for talking to Telegram), "first_name" and "channel"
    ('telegram' or 'web').

    Telegram initData wins when present: it's validated and the `users`
    row is upserted, exactly as before web sign-in existed. Without it, a
    valid session cookie (set by /api/auth/google) identifies a browser
    user. Neither -> 401."""
    if not init_data and request is not None:
        token = request.cookies.get(SESSION_COOKIE)
        if token:
            check_same_origin(request)
            account = db.get_session_user(token)
            if account:
                return {"user_id": account["id"], "id": account["telegram_id"],
                        "first_name": account["name"], "username": None, "channel": "web"}
        raise HTTPException(401, "Not signed in")
    parsed = verify_init_data(init_data)
    try:
        user = json.loads(parsed.get("user", "{}"))
    except json.JSONDecodeError:
        raise HTTPException(400, "Malformed user data in initData")
    telegram_id = user.get("id")
    if not telegram_id:
        raise HTTPException(400, "Missing user id in initData")
    user["user_id"] = db.ensure_user(telegram_id, user.get("username"), user.get("first_name"))
    user["channel"] = "telegram"
    return user


def check_same_origin(request: Request) -> None:
    """Cookie-authenticated requests must come from this site's own pages.
    The cookie is SameSite=Lax, which already keeps it off cross-site POSTs
    in current browsers; this is the second lock. Requests without an
    Origin header (some same-origin navigations) are allowed - a
    cross-site fetch/form POST always sends one."""
    origin = request.headers.get("origin")
    if origin and urlparse(origin).netloc != request.headers.get("host"):
        raise HTTPException(403, "Cross-site request rejected")
