"""Every app/db function, plus the HTTP routes that take a record id, run
against a real local Postgres - the mocked tests in tests/ never execute
this SQL. Two Telegram users, A and B: everything A creates must work for
A and be invisible/untouchable for B.

The schema comes from ae-coach-bot (it owns it), so this needs that repo
checked out next to this one, as it is in "ae coach bot/". It refuses to
run against anything but a local server, since it creates and drops a
database.

    brew services start postgresql@18
    python3 tests/integration/test_db_real_postgres.py
"""

import hashlib
import hmac
import importlib.util
import json
import os
import sys
import time
from pathlib import Path
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

DB_NAME = f"chashma_webapp_test_{os.getpid()}"
admin = psycopg2.connect(ADMIN_URL)
admin.autocommit = True
admin.cursor().execute(f'DROP DATABASE IF EXISTS "{DB_NAME}"')
admin.cursor().execute(f'CREATE DATABASE "{DB_NAME}"')
DSN = make_dsn(ADMIN_URL, dbname=DB_NAME)
with psycopg2.connect(DSN) as conn, conn.cursor() as cur:
    # Same order as ae-coach-bot's state.init_db().
    bot_schema.create_tables(cur)
    bot_schema.migrate_legacy_state(cur)
    bot_schema.migrate_legacy_cv_text(cur)
    bot_schema.migrate_internal_user_id(cur)

TOKEN = "123456:integration-test-token"
os.environ.update(DATABASE_URL=DSN, TELEGRAM_TOKEN=TOKEN, ANTHROPIC_API_KEY="dummy")
sys.path.insert(0, str(ROOT))

from app import db  # noqa: E402
from app.db import pool as db_pool  # noqa: E402


def q(sql, params=()):
    with psycopg2.connect(DSN) as c, c.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


try:
    TG_A, TG_B = 111, 222

    # --- users ---
    a = db.ensure_user(TG_A, "alice_tg", "Alice")
    b = db.ensure_user(TG_B, None, "Bob")
    assert isinstance(a, int) and isinstance(b, int) and a != b
    assert a not in (TG_A, TG_B), "internal id must not just echo the Telegram id"
    assert db.ensure_user(TG_A, "alice_new", "Ignored") == a, "same Telegram user -> same internal id"
    assert q("SELECT username, name FROM users WHERE id = %s", (a,)) == [("alice_new", "Alice")], \
        "username refreshes, but a name already given is kept"
    q("UPDATE users SET language = 'uz', name = 'Aziza' WHERE id = %s RETURNING 1", (a,))
    assert (db.get_user_language(a), db.get_user_name(a)) == ("uz", "Aziza")
    assert (db.get_user_language(b), db.get_user_name(b)) == ("en", "Bob")
    assert db.get_quota_status(a) == (0, db.FREE_LIMIT)
    db.increment_usage_count(a)
    q("UPDATE users SET quota_override = 12 WHERE id = %s RETURNING 1", (b,))
    assert db.get_quota_status(a) == (1, db.FREE_LIMIT) and db.get_quota_status(b) == (0, 12)
    print("PASS: users - ensure_user returns a stable internal id; language, name, quota per user")

    # --- cvs ---
    cv1 = db.add_cv(a, "a1.pdf", "A's first CV", "Analyst")
    cv2 = db.add_cv(a, "a2.pdf", "A's second CV", None)
    db.add_cv(b, "b.pdf", "B's CV", None)
    assert db.get_active_cv_text(a) == "A's second CV" and db.get_active_cv_text(b) == "B's CV"
    assert [c["id"] for c in db.list_cvs(a)] == [cv2, cv1] and len(db.list_cvs(b)) == 1
    assert db.set_active_cv(b, cv1) is False and db.delete_cv(b, cv1) is False, "B must not touch A's CV"
    assert db.get_active_cv_text(a) == "A's second CV"
    assert db.set_active_cv(a, cv1) is True and db.get_active_cv_text(a) == "A's first CV"
    assert db.delete_cv(a, cv1) is True and db.get_active_cv_text(a) == "A's second CV", \
        "deleting the active CV promotes the newest remaining one"
    print("PASS: cvs - one active per user, switch/delete only your own")

    # --- applications ---
    db.save_application(a, {"title": "Analyst", "company": "Acme", "url": "https://acme/1"}, "cv", {"score": 80, "matched": ["SQL"], "missing": []})
    db.save_application(b, {"title": "BI Dev", "company": "Globex"}, "cv", None)
    apps_a = db.list_applications(a)
    assert [(x["title"], x["match_score"]) for x in apps_a] == [("Analyst", 80)] and len(db.list_applications(b)) == 1
    app_id = apps_a[0]["id"]
    assert db.update_application_status(b, app_id, "offer") is False and db.delete_application(b, app_id) is False
    assert db.update_application_status(a, app_id, "phone_screen") is True
    assert db.list_applications(a)[0]["status"] == "phone_screen"
    print("PASS: applications - list/update/delete only your own")

    # --- cv_analyses ---
    an = db.save_analysis(a, "JD text", {"score": 70}, {}, {}, {"level": "mid"})
    assert db.save_roadmap_item(b, an, 1, "CV Fixes", {"fixes": []}) is False
    assert db.save_roadmap_item(a, an, 1, "CV Fixes", {"fixes": [{"issue": "x"}]}) is True
    got = db.get_analysis(a, an)
    assert got["ats"] == {"score": 70} and got["roadmap_items"] == {"1": {"title": "CV Fixes", "fixes": [{"issue": "x"}]}}
    assert db.get_analysis(b, an) is None and db.list_analyses(b) == [] and len(db.list_analyses(a)) == 1
    assert db.delete_analysis(b, an) is False and db.delete_analysis(a, an) is True and db.list_analyses(a) == []
    print("PASS: cv_analyses - history, roadmap items, get/delete only your own")

    # --- saved search + alerts ---
    db.save_search_criteria(a, "Data Analyst", "Tashkent", True)
    db.save_search_criteria(b, "BI Developer", "", False)
    assert db.get_saved_search(a) == {"job_title": "Data Analyst", "location": "Tashkent", "alerts_enabled": True}
    assert db.get_saved_search(b) == {"job_title": "BI Developer", "location": None, "alerts_enabled": False}
    assert db.list_users_with_alerts_enabled() == [(a, TG_A, "Data Analyst", "Tashkent")]
    vac = [{"title": "Analyst", "company": "Acme", "location": "Tashkent", "summary": "s", "url": "https://acme/9"}]
    assert db.filter_new_vacancy_urls(a, ["https://acme/9"]) == ["https://acme/9"]
    db.mark_vacancies_alerted(a, vac, "batch-1", "Data Analyst", "Tashkent")
    db.mark_vacancies_alerted(a, vac, "batch-2", "Data Analyst", "Tashkent")  # same URL again: ignored
    assert db.filter_new_vacancy_urls(a, ["https://acme/9"]) == [] and db.filter_new_vacancy_urls(b, ["https://acme/9"]) == ["https://acme/9"]
    assert db.get_alert_batch(a, "batch-1")["vacancies"][0]["url"] == "https://acme/9"
    assert db.get_alert_batch(b, "batch-1") is None and db.get_alert_batch(a, "batch-2") is None
    print("PASS: saved search + alerts - per user, dedup by URL, batches only visible to their owner")

    # --- orders + events ---
    o1 = db.get_or_create_order(a, 9_900_000, "10_checks")
    assert db.get_or_create_order(a, 8_000_000, "10_checks") == o1, "pending order reused per package"
    assert db.get_or_create_order(b, 9_900_000, "10_checks") != o1, "never reuse another user's order"
    db.log_event(a, "check_completed", {"x": 1})
    assert q("SELECT amount FROM orders WHERE id = %s", (o1,)) == [(8_000_000,)]
    print("PASS: orders and events - written under the right user")

    # Rows written by user_id must still carry telegram_id (the trigger), so the
    # bot and payme-webhook - which still read telegram_id until they switch - see them.
    for t in bot_schema.USER_CHILD_TABLES:
        missing = q(f"""SELECT count(*) FROM {t} c JOIN users u ON u.id = c.user_id
                        WHERE c.telegram_id IS DISTINCT FROM u.telegram_id""")[0][0]
        assert missing == 0, f"{t}: {missing} rows without the matching telegram_id"
    print("PASS: every row written by user_id also carries the owner's telegram_id")

    # --- HTTP routes that take a record id: B's request for A's record ---
    from fastapi.testclient import TestClient
    import server

    def init_data(tg_id, name):
        fields = {"user": json.dumps({"id": tg_id, "first_name": name}), "auth_date": str(int(time.time()))}
        check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
        secret = hmac.new(b"WebAppData", TOKEN.encode(), hashlib.sha256).digest()
        fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
        return urlencode(fields)

    client = TestClient(server.app)
    ia, ib = init_data(TG_A, "Alice"), init_data(TG_B, "Bob")
    an2 = db.save_analysis(a, "JD 2", {}, {}, {}, {})
    cv_a = db.list_cvs(a)[0]["id"]
    for path, body in [
        ("/api/checks/get", {"analysis_id": an2}),
        ("/api/checks/delete", {"analysis_id": an2}),
        ("/api/cvs/set-active", {"cv_id": cv_a}),
        ("/api/cvs/delete", {"cv_id": cv_a}),
        ("/api/applications/update-status", {"application_id": app_id, "status": "offer"}),
        ("/api/applications/delete", {"application_id": app_id}),
        ("/api/alert-batch", {"batch_id": "batch-1"}),
    ]:
        r = client.post(path, json={"init_data": ib, **body})
        assert r.status_code == 404, f"B -> {path}: expected 404, got {r.status_code} {r.text}"
    assert db.get_analysis(a, an2) is not None and db.list_cvs(a)[0]["id"] == cv_a
    assert db.list_applications(a)[0]["status"] == "phone_screen" and db.get_alert_batch(a, "batch-1")
    r = client.post("/api/checks/get", json={"init_data": ia, "analysis_id": an2})
    assert r.status_code == 200 and r.json()["id"] == an2, r.text
    r = client.post("/api/cvs", json={"init_data": ib})
    assert [c["label"] for c in r.json()["cvs"]] == ["b.pdf"], r.text
    r = client.post("/api/cv-status", json={"init_data": ia})
    assert r.json() == {"has_cv": True, "lang": "uz", "name": "Aziza"}, r.text
    print("PASS: routes - B gets 404 for every one of A's records, A's data untouched; A and B each see their own")
finally:
    if db_pool._pool is not None:
        db_pool._pool.closeall()
    admin.cursor().execute(f'DROP DATABASE IF EXISTS "{DB_NAME}" WITH (FORCE)')
    admin.close()

print("\nALL REAL-POSTGRES WEBAPP CHECKS PASSED")
