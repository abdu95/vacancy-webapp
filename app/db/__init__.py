"""
DB access for vacancy-webapp, sharing the same Postgres the bot uses
(tables are created by bot/state.py's init_db() - this package only
reads/writes, never creates schema).

Split into one module per feature area (2026-09-07, alongside the
matching app/routes/ split) - this __init__ re-exports every public
name so every existing call site (`from app import db; db.foo(...)`)
and every existing test (`mock.patch.object(db, "foo", ...)`) keeps
working completely unchanged. Every submodule reaches the connection
pool via `db.get_pool()` (this module's re-export), not a direct import
of app.db.pool - that's what makes patching `db.get_pool` in tests
affect every submodule's queries, regardless of which file they live in.

get_active_companies (with its in-process cache) and check_connection
stay here rather than in their own submodules: existing tests poke
their cache state directly as db._companies_cache/_companies_cache_at/
_COMPANIES_CACHE_TTL, so that state has to keep living on this exact
module object.
"""

import time

from app.db.pool import get_pool
from app.db.users import FREE_LIMIT, ensure_user, get_quota_status, get_user_language, increment_usage_count
from app.db.cvs import add_cv, delete_cv, get_active_cv_text, list_cvs, set_active_cv
from app.db.applications import (
    VALID_STATUSES,
    delete_application,
    list_applications,
    save_application,
    update_application_status,
)
from app.db.analyses import delete_analysis, get_analysis, list_analyses, save_analysis, save_roadmap_item
from app.db.alerts import (
    filter_new_vacancy_urls,
    get_alert_batch,
    get_saved_search,
    list_users_with_alerts_enabled,
    mark_vacancies_alerted,
    save_search_criteria,
)
from app.db.payments import get_or_create_order
from app.db.events import log_event

__all__ = [
    "get_pool",
    "FREE_LIMIT", "ensure_user", "get_quota_status", "get_user_language", "increment_usage_count",
    "add_cv", "delete_cv", "get_active_cv_text", "list_cvs", "set_active_cv",
    "VALID_STATUSES", "delete_application", "list_applications", "save_application", "update_application_status",
    "delete_analysis", "get_analysis", "list_analyses", "save_analysis", "save_roadmap_item",
    "filter_new_vacancy_urls", "get_alert_batch", "get_saved_search", "list_users_with_alerts_enabled",
    "mark_vacancies_alerted", "save_search_criteria",
    "get_or_create_order", "log_event",
    "get_active_companies", "check_connection",
]

_companies_cache: dict[str, str] | None = None
_companies_cache_at: float = 0.0
_COMPANIES_CACHE_TTL = 600  # 10 minutes


def get_active_companies() -> dict[str, str]:
    """Returns {slug: display_name} for active Greenhouse companies.
    Cached in-process so a vacancy search doesn't hit Postgres every
    call - editing scripts/greenhouse_companies.csv and running
    scripts/sync_greenhouse_companies.py takes effect within
    _COMPANIES_CACHE_TTL seconds, no deploy needed."""
    global _companies_cache, _companies_cache_at
    now = time.monotonic()
    if _companies_cache is not None and (now - _companies_cache_at) < _COMPANIES_CACHE_TTL:
        return _companies_cache

    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT slug, display_name FROM greenhouse_companies WHERE active = true")
            _companies_cache = dict(cur.fetchall())
            _companies_cache_at = now
            return _companies_cache
    finally:
        pool.putconn(conn)


def check_connection() -> dict:
    """Health check: confirms we can reach Postgres and that the
    applications table (created by the bot) is visible from here."""
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'applications' ORDER BY ordinal_position
            """)
            columns = [r[0] for r in cur.fetchall()]
        return {"connected": True, "applications_columns": columns}
    finally:
        pool.putconn(conn)
