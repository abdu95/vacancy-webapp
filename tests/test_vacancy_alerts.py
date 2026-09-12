"""
Tests for app/services/vacancy_alerts.py - the daily digest job - and
app/db.py's saved-search/dedup functions it depends on.
"""

import asyncio
import os
import sys
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DATABASE_URL", "postgresql://fake")
os.environ.setdefault("TELEGRAM_TOKEN", "dummy:token")

from app import db  # noqa: E402
from app.services import vacancy_alerts, vacancy_source  # noqa: E402


def make_fake_pool(fetchone_result=None, fetchall_result=None):
    fake_cursor = mock.MagicMock()
    fake_cursor.fetchone = mock.Mock(return_value=fetchone_result)
    fake_cursor.fetchall = mock.Mock(return_value=fetchall_result or [])
    fake_cursor.__enter__ = mock.Mock(return_value=fake_cursor)
    fake_cursor.__exit__ = mock.Mock(return_value=False)

    fake_conn = mock.MagicMock()
    fake_conn.cursor = mock.Mock(return_value=fake_cursor)
    fake_conn.__enter__ = mock.Mock(return_value=fake_conn)
    fake_conn.__exit__ = mock.Mock(return_value=False)

    fake_pool = mock.MagicMock()
    fake_pool.getconn = mock.Mock(return_value=fake_conn)
    fake_pool.putconn = mock.Mock()
    return fake_pool, fake_cursor


# --- db.get_saved_search / save_search_criteria ---

pool, cursor = make_fake_pool(fetchone_result=("Data Analyst", "Tashkent", True))
with mock.patch.object(db, "get_pool", return_value=pool):
    result = db.get_saved_search(777)
    assert result == {"job_title": "Data Analyst", "location": "Tashkent", "alerts_enabled": True}
print("PASS: get_saved_search returns the saved criteria")

pool, cursor = make_fake_pool(fetchone_result=None)
with mock.patch.object(db, "get_pool", return_value=pool):
    result = db.get_saved_search(999)
    assert result == {"job_title": None, "location": None, "alerts_enabled": False}
print("PASS: get_saved_search defaults sanely for a user row that doesn't exist yet")

pool, cursor = make_fake_pool()
with mock.patch.object(db, "get_pool", return_value=pool):
    db.save_search_criteria(777, "Data Analyst", "Tashkent", True)
    params = cursor.execute.call_args[0][1]
    assert params == ("Data Analyst", "Tashkent", True, 777)
print("PASS: save_search_criteria writes job_title/location/alerts_enabled")

# --- db.list_users_with_alerts_enabled ---

pool, cursor = make_fake_pool(fetchall_result=[(1, "Data Analyst", "Tashkent"), (2, "BI Developer", None)])
with mock.patch.object(db, "get_pool", return_value=pool):
    result = db.list_users_with_alerts_enabled()
    assert result == [(1, "Data Analyst", "Tashkent"), (2, "BI Developer", None)]
    query = cursor.execute.call_args[0][0]
    assert "vacancy_alerts_enabled = true" in query
    assert "saved_job_title IS NOT NULL" in query
print("PASS: list_users_with_alerts_enabled queries opted-in users with a job title set")

# --- db.filter_new_vacancy_urls / mark_vacancies_alerted ---

pool, cursor = make_fake_pool(fetchall_result=[("https://a.com/1",)])
with mock.patch.object(db, "get_pool", return_value=pool):
    result = db.filter_new_vacancy_urls(777, ["https://a.com/1", "https://a.com/2"])
    assert result == ["https://a.com/2"], result
print("PASS: filter_new_vacancy_urls drops URLs already alerted, keeps genuinely new ones")

assert db.filter_new_vacancy_urls(777, []) == [], "must short-circuit on an empty list, no DB call needed"
print("PASS: filter_new_vacancy_urls short-circuits on an empty input")

pool, cursor = make_fake_pool()
with mock.patch.object(db, "get_pool", return_value=pool):
    db.mark_vacancies_alerted(
        777, [{"title": "Data Analyst", "company": "Acme", "location": "Tashkent",
               "summary": "desc", "url": "https://a.com/2"}],
        "batch-1", "Data Analyst", "Tashkent",
    )
    assert cursor.executemany.called
    rows = cursor.executemany.call_args[0][1]
    assert rows == [(777, "https://a.com/2", "batch-1", "Data Analyst", "Acme", "Tashkent", "desc", "Data Analyst", "Tashkent")]
print("PASS: mark_vacancies_alerted records the newly-sent vacancies with their batch")

pool, cursor = make_fake_pool(fetchall_result=[
    ("Data Analyst", "Acme", "Tashkent", "desc", "https://a.com/2", "Data Analyst", "Tashkent"),
])
with mock.patch.object(db, "get_pool", return_value=pool):
    result = db.get_alert_batch(777, "batch-1")
    assert result == {
        "vacancies": [{"title": "Data Analyst", "company": "Acme", "location": "Tashkent",
                       "summary": "desc", "url": "https://a.com/2"}],
        "job_title": "Data Analyst", "location": "Tashkent",
    }, result
print("PASS: get_alert_batch returns the batch's vacancies plus the searched criteria")

pool, cursor = make_fake_pool(fetchall_result=[])
with mock.patch.object(db, "get_pool", return_value=pool):
    assert db.get_alert_batch(777, "missing-batch") is None
print("PASS: get_alert_batch returns None for an unknown/foreign batch_id")

# --- vacancy_alerts._build_digest ---

vacancies = [
    {"title": "Data Analyst", "company": "Acme", "url": "https://a.com/1"},
    {"title": "Senior Data Analyst", "company": "Globex", "url": "https://a.com/2"},
]
digest = vacancy_alerts._build_digest("Data Analyst", "Tashkent", vacancies)
assert "2 new vacancies" in digest
assert "Data Analyst" in digest and "Acme" in digest
assert "https://a.com/1" in digest and "https://a.com/2" in digest
assert "in Tashkent" in digest
print("PASS: _build_digest lists every vacancy in one message, mentions the location")

digest_one = vacancy_alerts._build_digest("Data Analyst", None, vacancies[:1])
assert "1 new vacancy" in digest_one, digest_one
assert "in " not in digest_one.split("matching")[1].split(":")[0], "no location should not say 'in ...'"
print("PASS: _build_digest handles singular phrasing and a missing location")

# --- vacancy_alerts.run_vacancy_alerts: end-to-end with mocked search/send/db ---


def _run(coro):
    return asyncio.run(coro)


with mock.patch.object(db, "list_users_with_alerts_enabled", return_value=[(777, "Data Analyst", "Tashkent")]), \
     mock.patch.object(vacancy_source, "search_vacancies", new=mock.AsyncMock(
         return_value=[{"title": "Data Analyst", "company": "Acme", "url": "https://a.com/1"}])), \
     mock.patch.object(db, "filter_new_vacancy_urls", return_value=["https://a.com/1"]), \
     mock.patch.object(vacancy_alerts, "_send_telegram_message", new=mock.AsyncMock()) as m_send, \
     mock.patch.object(db, "mark_vacancies_alerted") as m_mark:
    summary = _run(vacancy_alerts.run_vacancy_alerts())
    assert summary == {"users_checked": 1, "alerts_sent": 1, "failed": 0}, summary
    m_send.assert_called_once()
    send_args = m_send.call_args[0]
    assert send_args[0] == 777
    batch_id = send_args[2]
    m_mark.assert_called_once_with(
        777, [{"title": "Data Analyst", "company": "Acme", "url": "https://a.com/1"}],
        batch_id, "Data Analyst", "Tashkent",
    )
print("PASS: run_vacancy_alerts sends one digest and marks the sent vacancies under one batch_id")

with mock.patch.object(db, "list_users_with_alerts_enabled", return_value=[(777, "Data Analyst", "Tashkent")]), \
     mock.patch.object(vacancy_source, "search_vacancies", new=mock.AsyncMock(
         return_value=[{"title": "Data Analyst", "company": "Acme", "url": "https://a.com/1"}])), \
     mock.patch.object(db, "filter_new_vacancy_urls", return_value=[]), \
     mock.patch.object(vacancy_alerts, "_send_telegram_message", new=mock.AsyncMock()) as m_send:
    summary = _run(vacancy_alerts.run_vacancy_alerts())
    assert summary == {"users_checked": 1, "alerts_sent": 0, "failed": 0}
    m_send.assert_not_called()
print("PASS: run_vacancy_alerts sends nothing when every match was already alerted (no re-sends)")

with mock.patch.object(db, "list_users_with_alerts_enabled", return_value=[(777, "Data Analyst", "Tashkent"), (778, "BI Developer", None)]), \
     mock.patch.object(vacancy_source, "search_vacancies", new=mock.AsyncMock(side_effect=[Exception("greenhouse down"), []])), \
     mock.patch.object(vacancy_alerts, "_send_telegram_message", new=mock.AsyncMock()) as m_send:
    summary = _run(vacancy_alerts.run_vacancy_alerts())
    assert summary["failed"] == 1
    assert summary["users_checked"] == 2
    m_send.assert_not_called()
print("PASS: one user's search failure doesn't stop the batch for the rest")

print("\nALL VACANCY ALERTS CHECKS PASSED")
