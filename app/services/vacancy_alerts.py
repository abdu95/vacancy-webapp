"""
Daily proactive vacancy alerts. For each user who has opted in
(users.vacancy_alerts_enabled) and set a saved job title, searches
Greenhouse via vacancy_source.py, dedupes against alerted_vacancies (a
posting already sent isn't sent again), and sends one digest message -
not one message per listing - for anything new.

Self-contained for this service (deploy isolation - see
vacancy_source.py's docstring for why): sends via a raw call to
Telegram's Bot API instead of pulling in python-telegram-bot, since
this process has no bot.Application to hang a message off of and
doesn't need one just to POST one HTTP request.
"""

import logging
import os

import httpx

from app import db
from app.services import vacancy_source

logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")

# This service's own public URL - the Mini App it serves is exactly
# what an alert should open. Railway sets RAILWAY_PUBLIC_DOMAIN
# automatically; no separate env var needed.
_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
MINI_APP_URL = f"https://{_domain}" if _domain else None


async def _send_telegram_message(telegram_id: int, text: str) -> None:
    payload = {
        "chat_id": telegram_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if MINI_APP_URL:
        payload["reply_markup"] = {
            "inline_keyboard": [[{"text": "Open AcceptedAI", "web_app": {"url": MINI_APP_URL}}]]
        }
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", json=payload)
        resp.raise_for_status()


def _build_digest(job_title: str, location: str | None, vacancies: list[dict]) -> str:
    where = f" in {location}" if location and location.strip().lower() != "any" else ""
    plural = "y" if len(vacancies) == 1 else "ies"
    lines = [f'🔔 <b>{len(vacancies)} new vacanc{plural}</b> matching "{job_title}"{where}:', ""]
    for v in vacancies:
        lines.append(f"• <b>{v['title']}</b> — {v['company']}")
        if v.get("url"):
            lines.append(v["url"])
        lines.append("")
    return "\n".join(lines).strip()


async def run_vacancy_alerts() -> dict:
    """Runs one full pass over every opted-in user. Returns a small
    summary dict (for logging/testing). Never raises past this point -
    one user's search or send failure must not stop the rest of the
    batch, the same reasoning as every other best-effort save in this
    codebase (see cv_analyses history-save)."""
    users = db.list_users_with_alerts_enabled()
    sent = 0
    failed = 0
    for telegram_id, job_title, location in users:
        try:
            vacancies = await vacancy_source.search_vacancies(
                job_title, location or "Any", "Any", "Any", seen_companies=None
            )
            urls = [v["url"] for v in vacancies if v.get("url")]
            new_urls = set(db.filter_new_vacancy_urls(telegram_id, urls))
            fresh = [v for v in vacancies if v.get("url") in new_urls]
            if not fresh:
                continue
            await _send_telegram_message(telegram_id, _build_digest(job_title, location, fresh))
            db.mark_vacancies_alerted(telegram_id, [v["url"] for v in fresh])
            sent += 1
        except Exception:
            logger.exception("Vacancy alert run failed for telegram_id=%s", telegram_id)
            failed += 1
    return {"users_checked": len(users), "alerts_sent": sent, "failed": failed}
