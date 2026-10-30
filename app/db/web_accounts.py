"""Browser (non-Telegram) accounts: Sign in with Google users and their
login sessions (web_sessions, schema owned by ae-coach-bot's
state/schema.py migrate_web_accounts). A web user is a normal `users` row
with telegram_id NULL and google_sub set; everything else in app/db works
on them unchanged, keyed by users.id."""

import hashlib
import json
import os
import secrets

from app import db

# Free checks a new browser sign-up starts with (Telegram users get
# FREE_LIMIT). Stored as their quota_override, so an admin /grant or a
# future payment stacks on it exactly as it does for Telegram users.
WEB_FREE_LIMIT = int(os.getenv("WEB_FREE_LIMIT", "10"))
SESSION_DAYS = 30
VALID_LANGUAGES = ("en", "uz", "ru")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def google_user_exists(google_sub: str) -> bool:
    """True if this Google account already has a Chashma account."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM users WHERE google_sub = %s", (google_sub,))
            return cur.fetchone() is not None
    finally:
        pool.putconn(conn)


def upsert_google_user(google_sub: str, email: str | None, given_name: str | None) -> tuple[int, bool]:
    """Finds the user for this Google account, or creates one (no
    telegram_id, signup_channel 'web', WEB_FREE_LIMIT checks). Refreshes
    email on every sign-in; never overwrites a name the user chose during
    onboarding. Returns (user_id, created)."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                INSERT INTO users (google_sub, email, name, signup_channel, quota_override)
                VALUES (%s, %s, %s, 'web', %s)
                ON CONFLICT (google_sub) DO UPDATE
                SET email = EXCLUDED.email, last_seen_at = now()
                RETURNING id, (xmax = 0) AS created
            """, (google_sub, email, given_name, WEB_FREE_LIMIT))
            user_id, created = cur.fetchone()
            if created:
                cur.execute(
                    "INSERT INTO events (user_id, event_type, metadata) VALUES (%s, 'user_seen', %s)",
                    (user_id, json.dumps({"channel": "web"})),
                )
            return user_id, created
    finally:
        pool.putconn(conn)


def create_session(user_id: int) -> str:
    """Returns a new random session token for the cookie. Only its hash is stored."""
    token = secrets.token_urlsafe(32)
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO web_sessions (token_hash, user_id, expires_at) VALUES (%s, %s, now() + %s * interval '1 day')",
                (_hash(token), user_id, SESSION_DAYS),
            )
        return token
    finally:
        pool.putconn(conn)


def get_session_user(token: str) -> dict | None:
    """The signed-in user for a session cookie, or None if the token is
    unknown, expired or signed out."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                UPDATE web_sessions s SET last_seen_at = now()
                FROM users u
                WHERE s.token_hash = %s AND s.expires_at > now() AND u.id = s.user_id
                RETURNING u.id, u.telegram_id, u.name
            """, (_hash(token),))
            row = cur.fetchone()
            if not row:
                return None
            cur.execute("UPDATE users SET last_seen_at = now() WHERE id = %s", (row[0],))
            return {"id": row[0], "telegram_id": row[1], "name": row[2]}
    finally:
        pool.putconn(conn)


def delete_session(token: str) -> None:
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("DELETE FROM web_sessions WHERE token_hash = %s", (_hash(token),))
    finally:
        pool.putconn(conn)


def get_account(user_id: int) -> dict:
    """Profile fields the web app's sign-in/onboarding/profile screens need."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "SELECT name, language, email, signup_channel, joined_waitlist FROM users WHERE id = %s",
                (user_id,),
            )
            name, language, email, channel, waitlisted = cur.fetchone()
            return {"name": name, "language": language, "email": email,
                    "channel": channel, "waitlisted": waitlisted}
    finally:
        pool.putconn(conn)


def complete_onboarding(user_id: int, name: str, language: str) -> None:
    if language not in VALID_LANGUAGES:
        raise ValueError(f"Invalid language: {language}")
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("UPDATE users SET name = %s, language = %s WHERE id = %s", (name, language, user_id))
    finally:
        pool.putconn(conn)


def join_waitlist(user_id: int) -> bool:
    """True if newly added, False if already on it - same columns as the bot's state.join_waitlist."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                UPDATE users SET joined_waitlist = true, waitlist_at = COALESCE(waitlist_at, now())
                WHERE id = %s AND NOT joined_waitlist
            """, (user_id,))
            return cur.rowcount > 0
    finally:
        pool.putconn(conn)
