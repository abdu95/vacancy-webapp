"""
users table: account upsert, language preference, and the shared
pay-per-check quota (checks_used/quota_override, same columns
ae-coach-bot's bot/state.py reads and writes).
"""

import os

from app import db

# Must match ae-coach-bot's FREE_LIMIT (bot/bot.py) - same quota pool,
# shared `users.checks_used`/`quota_override` columns.
FREE_LIMIT = int(os.getenv("FREE_LIMIT", "2"))


def ensure_user(telegram_id: int, username: str | None, name: str | None) -> None:
    """Upserts a `users` row for this telegram_id, mirroring what
    bot/state.py's _upsert_and_load_account does. Required before any
    write to `applications`, since that table has
    telegram_id REFERENCES users(telegram_id) - a user who only ever
    opens the Mini App (never /start in chat) would otherwise have no
    `users` row and every save would fail on the FK constraint."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("""
                INSERT INTO users (telegram_id, username, name)
                VALUES (%s, %s, %s)
                ON CONFLICT (telegram_id) DO UPDATE
                SET last_seen_at = now(),
                    username = COALESCE(EXCLUDED.username, users.username),
                    name = COALESCE(users.name, EXCLUDED.name)
            """, (telegram_id, username, name))
    finally:
        pool.putconn(conn)


def get_user_language(telegram_id: int) -> str:
    """Returns the language the user picked in the bot (uz/ru), matching
    bot/i18n.py's fallback: empty/unset -> "en". Deliberately NOT the
    device's system language (Telegram's initData.user.language_code) -
    that reflects the phone's OS locale, not what the user actually chose
    via the bot's language picker (see bot.py's send_language_picker)."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT language FROM users WHERE telegram_id = %s", (telegram_id,))
            row = cur.fetchone()
            return row[0] if row and row[0] else "en"
    finally:
        pool.putconn(conn)


def get_quota_status(telegram_id: int) -> tuple[int, int]:
    """Returns (usage_count, effective_quota), mirroring bot/state.py's
    get_quota_override + bot/bot.py's effective_quota exactly - a real
    quota_override (set by an admin /grant or a Payme purchase, from
    either service) always wins over FREE_LIMIT."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT checks_used, quota_override FROM users WHERE telegram_id = %s", (telegram_id,))
            row = cur.fetchone()
            if not row:
                return 0, FREE_LIMIT
            checks_used, quota_override = row
            return checks_used, (quota_override if quota_override is not None else FREE_LIMIT)
    finally:
        pool.putconn(conn)


def increment_usage_count(telegram_id: int) -> None:
    """Called once, only after a successful analyze_cv - matches the bot's
    exact quota semantics (roadmap/CV-fix follow-ons stay free)."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("UPDATE users SET checks_used = checks_used + 1 WHERE telegram_id = %s", (telegram_id,))
    finally:
        pool.putconn(conn)
