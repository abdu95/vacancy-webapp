import json
import os
import sys
import unittest.mock as mock
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("DATABASE_URL", "postgresql://fake")

from app import db  # noqa: E402


def make_fake_pool(fetchone_result=None, fetchall_result=None, rowcount=1):
    fake_cursor = mock.MagicMock()
    fake_cursor.fetchone = mock.Mock(return_value=fetchone_result)
    fake_cursor.fetchall = mock.Mock(return_value=fetchall_result or [])
    fake_cursor.rowcount = rowcount
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


# --- save_analysis: inserts and returns the new id ---
pool, cursor = make_fake_pool(fetchone_result=(101,))
with mock.patch.object(db, "get_pool", return_value=pool):
    ats = {"score": 70}
    result = db.save_analysis(777, "some jd text", ats, {"passing": []}, {"SQL": "strong"}, {"assessment": "Mid"})
    assert result == 101, result
    call_args = cursor.execute.call_args[0]
    assert "INSERT INTO cv_analyses" in call_args[0]
    assert call_args[1][0] == 777
    assert call_args[1][1] == "some jd text"
    assert json.loads(call_args[1][2]) == ats
print("PASS: save_analysis inserts a row (JSONB fields json.dumps'd) and returns the new id")

# --- save_roadmap_item: merges into roadmap_items, returns True/False by rowcount ---
pool, cursor = make_fake_pool(rowcount=1)
with mock.patch.object(db, "get_pool", return_value=pool):
    ok = db.save_roadmap_item(777, 101, 1, "CV Fixes", {"fixes": [{"issue": "x"}]})
    assert ok is True
    call_args = cursor.execute.call_args[0]
    assert "UPDATE cv_analyses" in call_args[0]
    assert "roadmap_items" in call_args[0]
    params = call_args[1]
    assert params[0] == "1", "item number must be passed as a string (JSON object key)"
    saved_body = json.loads(params[1])
    assert saved_body == {"title": "CV Fixes", "fixes": [{"issue": "x"}]}
    assert params[2] == 101 and params[3] == 777
print("PASS: save_roadmap_item merges {title, ...body} into roadmap_items keyed by item number")

pool, cursor = make_fake_pool(rowcount=0)
with mock.patch.object(db, "get_pool", return_value=pool):
    ok = db.save_roadmap_item(777, 999, 1, "CV Fixes", {"fixes": []})
    assert ok is False
print("PASS: save_roadmap_item returns False when the analysis isn't found/owned (rowcount=0)")

# --- list_analyses: maps rows to dicts, newest first (ORDER BY is in the query, not re-tested here) ---
now = datetime(2026, 9, 7, 12, 0, 0)
pool, cursor = make_fake_pool(fetchall_result=[(2, "jd two", {"assessment": "Mid"}, now), (1, "jd one", {"assessment": "Junior"}, now)])
with mock.patch.object(db, "get_pool", return_value=pool):
    result = db.list_analyses(777)
    assert result == [
        {"id": 2, "jd_text": "jd two", "level": {"assessment": "Mid"}, "created_at": now.isoformat()},
        {"id": 1, "jd_text": "jd one", "level": {"assessment": "Junior"}, "created_at": now.isoformat()},
    ], result
print("PASS: list_analyses returns id/jd_text/level/created_at per row")

# --- get_analysis: full detail, or None if not found/owned ---
pool, cursor = make_fake_pool(fetchone_result=(1, "jd", {"score": 1}, {"a": 1}, {"b": 1}, {"assessment": "Mid"}, {"1": {"title": "x"}}, now))
with mock.patch.object(db, "get_pool", return_value=pool):
    result = db.get_analysis(777, 1)
    assert result["id"] == 1
    assert result["roadmap_items"] == {"1": {"title": "x"}}
    assert result["created_at"] == now.isoformat()
print("PASS: get_analysis returns the full row as a dict")

pool, cursor = make_fake_pool(fetchone_result=None)
with mock.patch.object(db, "get_pool", return_value=pool):
    assert db.get_analysis(777, 999) is None
print("PASS: get_analysis returns None for a not-found/not-owned id")

# --- delete_analysis: True/False by rowcount ---
pool, cursor = make_fake_pool(rowcount=1)
with mock.patch.object(db, "get_pool", return_value=pool):
    assert db.delete_analysis(777, 1) is True
pool, cursor = make_fake_pool(rowcount=0)
with mock.patch.object(db, "get_pool", return_value=pool):
    assert db.delete_analysis(777, 999) is False
print("PASS: delete_analysis returns True/False based on whether a row was actually deleted")

print("\nALL ANALYSES DB CHECKS PASSED")
