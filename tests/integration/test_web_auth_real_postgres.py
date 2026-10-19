"""Sign in with Google, end to end through the real FastAPI app and a real
local Postgres - only Google's token check is stood in for. Same setup and
requirements as test_db_real_postgres.py (ae-coach-bot checked out next to
this repo, local Postgres running).

    python3 tests/integration/test_web_auth_real_postgres.py
"""

import hashlib
import hmac
import importlib.util
import json
import os
import sys
import time
from pathlib import Path
from unittest import mock
from urllib.parse import urlencode

import psycopg2
from psycopg2.extensions import make_dsn, parse_dsn

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PY = ROOT.parent / "ae-coach-bot" / "bot" / "state" / "schema.py"
ADMIN_URL = os.getenv("TEST_DATABASE_ADMIN_URL", "postgresql:///postgres")
host = parse_dsn(ADMIN_URL).get("host", "")
if host not in {"", "localhost", "127.0.0.1", "::1"} and not host.startswith("/"):
    sys.exit(f"Refusing to run against non-local host {host!r}")
if not SCHEMA_PY.exists():
    sys.exit(f"Needs ae-coach-bot next to this repo (looked for {SCHEMA_PY})")

spec = importlib.util.spec_from_file_location("bot_schema", SCHEMA_PY)
bot_schema = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot_schema)

DB_NAME = f"chashma_webauth_test_{os.getpid()}"
admin = psycopg2.connect(ADMIN_URL)
admin.autocommit = True
admin.cursor().execute(f'DROP DATABASE IF EXISTS "{DB_NAME}"')
admin.cursor().execute(f'CREATE DATABASE "{DB_NAME}"')
DSN = make_dsn(ADMIN_URL, dbname=DB_NAME)
with psycopg2.connect(DSN) as conn, conn.cursor() as cur:
    bot_schema.create_tables(cur)
    bot_schema.migrate_legacy_state(cur)
    bot_schema.migrate_legacy_cv_text(cur)
    bot_schema.migrate_internal_user_id(cur)
    bot_schema.contract_internal_user_id(cur)
    bot_schema.migrate_web_accounts(cur)

TOKEN = "123456:integration-test-token"
CLIENT_ID = "test-client.apps.googleusercontent.com"
os.environ.update(DATABASE_URL=DSN, TELEGRAM_TOKEN=TOKEN, ANTHROPIC_API_KEY="dummy",
                  GOOGLE_CLIENT_ID=CLIENT_ID, PAYME_ID="test-merchant")
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
from app import db  # noqa: E402
from app.auth import SESSION_COOKIE  # noqa: E402
from app.db import pool as db_pool  # noqa: E402
from app.routes import web_auth  # noqa: E402

BASE = "https://chashma.test"
SAME_ORIGIN = {"Origin": BASE}


def q(sql, params=()):
    with psycopg2.connect(DSN) as c, c.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall() if cur.description else None


def google_claims(sub, email, given_name, verified=True):
    return {"sub": sub, "email": email, "given_name": given_name, "email_verified": verified,
            "iss": "https://accounts.google.com", "aud": CLIENT_ID}


def fake_google(claims):
    """Stands in for Google: accepts credential 'good-<sub>' only, checks the audience."""
    def verify(credential, request, audience):
        assert audience == CLIENT_ID, "must verify against our client id"
        if credential != f"good-{claims['sub']}":
            raise ValueError("Token has wrong signature")
        return claims
    return mock.patch.object(web_auth.id_token, "verify_oauth2_token", side_effect=verify)


def browser():
    return TestClient(server.app, base_url=BASE)


def sign_in(client, sub, email, name, verified=True):
    with fake_google(google_claims(sub, email, name, verified)):
        return client.post("/api/auth/google", json={"credential": f"good-{sub}"}, headers=SAME_ORIGIN)


def post(client, path, body=None):
    return client.post(path, json=body or {}, headers=SAME_ORIGIN)


def init_data(tg_id, name):
    fields = {"user": json.dumps({"id": tg_id, "first_name": name}), "auth_date": str(int(time.time()))}
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


try:
    assert browser().get("/api/web-config").json() == {"google_client_id": CLIENT_ID, "web_free_limit": db.WEB_FREE_LIMIT}
    print("PASS: /api/web-config hands the browser the Google client id")

    # --- first sign-in creates a browser user ---
    sarah = browser()
    r = sign_in(sarah, "g-sarah", "sarah@example.com", "Sarah")
    assert r.status_code == 200, r.text
    assert r.json() == {"needs_onboarding": True, "name": "Sarah"}
    cookie = r.headers["set-cookie"]
    assert SESSION_COOKIE in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower() and "Secure" in cookie, cookie
    row = q("SELECT id, telegram_id, email, name, signup_channel, quota_override, language FROM users WHERE google_sub = 'g-sarah'")
    assert len(row) == 1 and row[0][1:] == (None, "sarah@example.com", "Sarah", "web", db.WEB_FREE_LIMIT, None), row
    sarah_id = row[0][0]
    token = sarah.cookies.get(SESSION_COOKIE)
    assert q("SELECT count(*) FROM web_sessions WHERE token_hash = %s", (token,)) == [(0,)], "raw token must never be stored"
    assert q("SELECT count(*) FROM web_sessions WHERE token_hash = %s", (hashlib.sha256(token.encode()).hexdigest(),)) == [(1,)]
    print("PASS: first Google sign-in creates a web user (no telegram_id, 10 checks) and an httpOnly/Secure/Lax session")

    # --- signing in again (another device) reuses the same user ---
    r2 = sign_in(browser(), "g-sarah", "sarah.new@example.com", "Ignored")
    assert r2.status_code == 200 and q("SELECT count(*), max(email), max(name) FROM users WHERE google_sub = 'g-sarah'") == [(1, "sarah.new@example.com", "Sarah")]
    print("PASS: the same Google account signs into the same user (email refreshed, chosen name kept)")

    # --- bad tokens never create a user ---
    before = q("SELECT count(*) FROM users")[0][0]
    with fake_google(google_claims("g-x", "x@example.com", "X")):
        bad = browser().post("/api/auth/google", json={"credential": "forged"}, headers=SAME_ORIGIN)
    assert bad.status_code == 401, bad.text
    assert sign_in(browser(), "g-unverified", "u@example.com", "U", verified=False).status_code == 401
    assert q("SELECT count(*) FROM users")[0][0] == before
    print("PASS: a forged/invalid Google token or an unverified email is rejected, no user created")

    # --- onboarding ---
    assert post(sarah, "/api/me").json()["needs_onboarding"] is True
    assert post(sarah, "/api/onboarding", {"name": "  ", "language": "en"}).status_code == 400
    assert post(sarah, "/api/onboarding", {"name": "Sarah", "language": "de"}).status_code == 400
    assert post(sarah, "/api/onboarding", {"name": "Sarah K", "language": "en"}).status_code == 200
    me = post(sarah, "/api/me").json()
    assert (me["name"], me["language"], me["email"], me["channel"], me["needs_onboarding"]) == ("Sarah K", "en", "sarah.new@example.com", "web", False), me
    print("PASS: onboarding validates and saves name + language; /api/me reflects it")

    # --- the existing app works for a browser user via the cookie alone ---
    st = post(sarah, "/api/cv-status").json()
    assert st == {"has_cv": False, "lang": "en", "name": "Sarah K"}, st
    qs = post(sarah, "/api/quota-status").json()
    assert (qs["remaining"], qs["quota"], qs["channel"]) == (db.WEB_FREE_LIMIT, db.WEB_FREE_LIMIT, "web"), qs
    db.add_cv(sarah_id, "sarah.pdf", "Sarah's CV " * 20, None)
    assert [c["label"] for c in post(sarah, "/api/cvs").json()["cvs"]] == ["sarah.pdf"]
    print("PASS: existing endpoints (cv-status, quota-status, cvs) work for a signed-in browser user")

    # --- 10 checks, then the limit; no Payme for web users ---
    q("UPDATE users SET checks_used = %s WHERE id = %s RETURNING 1", (db.WEB_FREE_LIMIT, sarah_id))
    r = post(sarah, "/api/cv-jd-analysis", {"jd": "We need a data analyst. " * 10})
    assert r.status_code == 200 and r.json()["limit_reached"] is True, r.text
    assert post(sarah, "/api/checkout", {"checks": 10}).status_code == 400
    assert q("SELECT count(*) FROM orders WHERE user_id = %s", (sarah_id,)) == [(0,)]
    w1, w2 = post(sarah, "/api/waitlist").json(), post(sarah, "/api/waitlist").json()
    assert w1 == {"joined": True, "already": False} and w2 == {"joined": True, "already": True}
    assert q("SELECT joined_waitlist, waitlist_at IS NOT NULL FROM users WHERE id = %s", (sarah_id,)) == [(True, True)]
    print("PASS: after 10 checks a web user hits the limit, can't open Payme checkout, and can join the waitlist")

    # --- isolation: another browser user, and a Telegram user ---
    tom = browser()
    assert sign_in(tom, "g-tom", "tom@example.com", "Tom").status_code == 200
    sarah_cv = post(sarah, "/api/cvs").json()["cvs"][0]["id"]
    assert post(tom, "/api/cvs").json()["cvs"] == []
    assert post(tom, "/api/cvs/delete", {"cv_id": sarah_cv}).status_code == 404
    tg = TestClient(server.app, base_url=BASE)
    r = tg.post("/api/cvs", json={"init_data": init_data(777, "Aziz")})
    assert r.status_code == 200 and r.json()["cvs"] == [], r.text
    assert tg.post("/api/cvs/delete", json={"init_data": init_data(777, "Aziz"), "cv_id": sarah_cv}).status_code == 404
    tq = tg.post("/api/quota-status", json={"init_data": init_data(777, "Aziz")}).json()
    assert (tq["channel"], tq["quota"]) == ("telegram", db.FREE_LIMIT), tq
    assert [c["label"] for c in post(sarah, "/api/cvs").json()["cvs"]] == ["sarah.pdf"]
    print("PASS: browser users and Telegram users each see only their own data; Telegram users unchanged (channel, FREE_LIMIT)")

    # --- the cookie is only trusted from this site ---
    evil = sarah.post("/api/cvs", json={}, headers={"Origin": "https://evil.example"})
    assert evil.status_code == 403, evil.text
    assert sarah.post("/api/cvs", json={}).status_code == 200, "no Origin header (same-origin navigation) is allowed"
    print("PASS: cookie-authenticated requests from another site are rejected (403)")

    # --- sign-out, unknown and expired sessions ---
    anon = browser()
    assert post(anon, "/api/me").status_code == 401
    anon.cookies.set(SESSION_COOKIE, "made-up-token", domain="chashma.test")
    assert post(anon, "/api/me").status_code == 401
    other = browser()
    sign_in(other, "g-sarah", "sarah.new@example.com", "Sarah")
    q("UPDATE web_sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = %s RETURNING 1",
      (hashlib.sha256(other.cookies.get(SESSION_COOKIE).encode()).hexdigest(),))
    assert post(other, "/api/me").status_code == 401, "an expired session must not authenticate"
    old_token = sarah.cookies.get(SESSION_COOKIE)
    out = post(sarah, "/api/auth/logout")
    assert out.status_code == 200 and SESSION_COOKIE in out.headers.get("set-cookie", "")
    replay = browser()
    replay.cookies.set(SESSION_COOKIE, old_token, domain="chashma.test")
    assert post(replay, "/api/me").status_code == 401, "a signed-out session token must stop working"
    print("PASS: no cookie, unknown cookie, expired session and signed-out session all get 401")

    # --- sign-in rate limit ---
    web_auth._signin_attempts.clear()
    statuses = [sign_in(browser(), "g-tom", "tom@example.com", "Tom").status_code for _ in range(web_auth._SIGNIN_LIMIT + 1)]
    assert statuses[:-1] == [200] * web_auth._SIGNIN_LIMIT and statuses[-1] == 429, statuses
    web_auth._signin_attempts.clear()
    print("PASS: sign-in attempts are rate limited per IP (429)")
finally:
    if db_pool._pool is not None:
        db_pool._pool.closeall()
    admin.cursor().execute(f'DROP DATABASE IF EXISTS "{DB_NAME}" WITH (FORCE)')
    admin.close()

print("\nALL WEB AUTH CHECKS PASSED")
