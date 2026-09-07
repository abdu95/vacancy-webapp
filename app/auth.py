"""
Telegram Mini App initData verification, shared by every app/routes/*
module. Split out of app/main.py during the routes/db package split
(2026-09-07) - every router needs authenticate()/verify_init_data(), so
this couldn't live inside any single feature's route file.
"""

import hashlib
import hmac
import json
import os
from urllib.parse import parse_qsl

from fastapi import HTTPException

from app import db

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")


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


def authenticate(init_data: str) -> dict:
    """Validates initData and ensures a `users` row exists for this
    telegram_id (needed before any write to `applications`, which has a
    foreign key to `users`). Returns the Telegram user dict (id,
    first_name, username)."""
    parsed = verify_init_data(init_data)
    try:
        user = json.loads(parsed.get("user", "{}"))
    except json.JSONDecodeError:
        raise HTTPException(400, "Malformed user data in initData")
    telegram_id = user.get("id")
    if not telegram_id:
        raise HTTPException(400, "Missing user id in initData")
    db.ensure_user(telegram_id, user.get("username"), user.get("first_name"))
    return user
