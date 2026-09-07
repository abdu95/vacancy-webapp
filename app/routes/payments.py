"""Pay-per-check quota status and Payme checkout - must match ae-coach-bot's
values exactly (same Payme merchant, same per-check price, same `orders`
table payme-webhook reads from)."""

import base64
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db
from app.auth import authenticate

router = APIRouter()

PAYME_ID = os.getenv("PAYME_ID", "")
PRICE_PER_CHECK_TIYIN = int(os.getenv("PRICE_PER_CHECK_TIYIN", "1000000"))
BOT_USERNAME = os.getenv("BOT_USERNAME", "")
MIN_CHECKS_PURCHASE = 1
MAX_CHECKS_PURCHASE = 100


class QuotaStatusRequest(BaseModel):
    init_data: str


@router.post("/api/quota-status")
async def quota_status(req: QuotaStatusRequest):
    user = authenticate(req.init_data)
    usage_count, quota = db.get_quota_status(user["id"])
    return {
        "remaining": max(0, quota - usage_count),
        "quota": quota,
        "price_per_check_tiyin": PRICE_PER_CHECK_TIYIN,
    }


class CheckoutRequest(BaseModel):
    init_data: str
    checks: int


@router.post("/api/checkout")
async def checkout(req: CheckoutRequest):
    user = authenticate(req.init_data)
    if not (MIN_CHECKS_PURCHASE <= req.checks <= MAX_CHECKS_PURCHASE):
        raise HTTPException(400, f"Choose between {MIN_CHECKS_PURCHASE} and {MAX_CHECKS_PURCHASE} checks")
    if not PAYME_ID:
        raise HTTPException(500, "Payment is not configured")

    amount = req.checks * PRICE_PER_CHECK_TIYIN
    order_id = db.get_or_create_order(user["id"], amount, f"{req.checks}_checks")
    raw = f"m={PAYME_ID};ac.order_id={order_id};a={amount};c=https://t.me/{BOT_USERNAME}"
    checkout_url = "https://checkout.paycom.uz/" + base64.b64encode(raw.encode()).decode()
    return {"checkout_url": checkout_url, "amount": amount, "checks": req.checks}
