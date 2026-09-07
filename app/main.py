import asyncio
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

from app import db
from app.services import vacancy_alerts
from app.routes import alerts, analysis, applications, checks, cvs, payments, vacancy_search

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache-busting version tag for /static/app.js and style.css - tied to
# process start time, so it changes automatically on every deploy with
# no manual bumping. Telegram's in-app WebView (and browsers) can hold
# onto a stale app.js/style.css across reopens otherwise, silently
# hiding fixes/features that are actually already live.
APP_VERSION = str(int(time.time()))

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI()

for router in (cvs.router, vacancy_search.router, applications.router, analysis.router,
               checks.router, alerts.router, payments.router):
    app.include_router(router)

# Daily vacancy-alerts scheduler. In-process asyncio loop rather than a new
# dependency (APScheduler etc.) - this is one job, once a day, and the
# process already runs an event loop. A redeploy resets the sleep-until
# timer, which just means it recomputes "next 4am UTC" on restart - not
# mission-critical timing, no need for persistence across restarts.
ALERT_HOUR_UTC = 4  # ~09:00 in Tashkent (UTC+5), the primary user base


async def _vacancy_alerts_loop() -> None:
    while True:
        now = datetime.now(timezone.utc)
        target = now.replace(hour=ALERT_HOUR_UTC, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        await asyncio.sleep((target - now).total_seconds())
        try:
            summary = await vacancy_alerts.run_vacancy_alerts()
            logger.info("Daily vacancy alerts run: %s", summary)
        except Exception:
            logger.exception("Daily vacancy alerts run failed")


@app.on_event("startup")
async def _start_background_jobs() -> None:
    asyncio.create_task(_vacancy_alerts_loop())


@app.get("/api/health")
async def health():
    try:
        return db.check_connection()
    except Exception:
        logger.exception("DB health check failed")
        raise HTTPException(500, "DB connection failed")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Cache-busts every /static/*.css and /static/*.js reference, not just
# one hardcoded app.js - the app's JS moved from a single app.js to
# several files loaded as separate <script> tags (2026-09-07), and this
# regex needs no update the next time that list changes.
_INDEX_HTML = (STATIC_DIR / "index.html").read_text()
_INDEX_HTML = re.sub(
    r'(href|src)="(/static/[^"]+\.(?:css|js))"',
    rf'\1="\2?v={APP_VERSION}"',
    _INDEX_HTML,
)


@app.get("/")
async def index():
    # No-cache on the HTML itself - it's what carries the ?v= that busts
    # the JS/CSS cache, so if THIS gets cached the whole scheme is moot.
    return HTMLResponse(_INDEX_HTML, headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
