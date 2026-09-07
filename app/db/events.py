"""events table: shared event log with ae-coach-bot's bot/state.py."""

import json

from app import db


def log_event(telegram_id: int, event_type: str, metadata: dict | None = None) -> None:
    """Same `events` table and event_type vocabulary as bot/state.py's
    log_event - using identical names (not webapp-prefixed ones) means
    bot.py's stats() picks these up with zero changes, regardless of
    whether the action happened in chat or in the Mini App."""
    pool = db.get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO events (telegram_id, event_type, metadata) VALUES (%s, %s, %s)",
                (telegram_id, event_type, json.dumps(metadata) if metadata is not None else None),
            )
    finally:
        pool.putconn(conn)
