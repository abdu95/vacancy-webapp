import hashlib
import hmac
import sys
import time
import unittest.mock as mock
from urllib.parse import urlencode

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

import os
os.environ["TELEGRAM_TOKEN"] = "dummy:token"
os.environ["ANTHROPIC_API_KEY"] = "dummy"
os.environ["DATABASE_URL"] = "postgresql://fake"

import server  # noqa: E402
from app import db  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

TOKEN = "dummy:token"


def build_init_data(user_json: str, token: str) -> str:
    fields = {"user": user_json, "auth_date": str(int(time.time())), "query_id": "AAtest"}
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret_key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


client = TestClient(server.app)
init_data = build_init_data('{"id":777,"first_name":"Test","username":"testuser"}', TOKEN)

FAKE_CHECKS = [
    {"id": 2, "jd_text": "Senior Data Analyst at Acme", "level": {"assessment": "Mid"}, "created_at": "2026-09-07T00:00:00"},
    {"id": 1, "jd_text": "Junior BI Developer", "level": {"assessment": "Junior"}, "created_at": "2026-09-01T00:00:00"},
]

FAKE_CHECK_DETAIL = {
    "id": 1,
    "jd_text": "Junior BI Developer",
    "ats": {"score": 62, "matched": ["SQL"], "missing": ["Tableau"], "verdict": "Decent start."},
    "xyz": {"passing": [], "failing": [], "rewrites": []},
    "tools": {"SQL": "strong", "Tableau": "not_found"},
    "level": {"assessment": "Junior", "reasoning": "Early career."},
    "roadmap_items": {"1": {"title": "CV Fixes", "fixes": []}},
    "created_at": "2026-09-01T00:00:00",
}

# --- Test 1: list checks returns the user's saved analysis history ---
with mock.patch.object(db, "ensure_user"), \
     mock.patch.object(db, "list_analyses", return_value=FAKE_CHECKS) as m_list:
    resp = client.post("/api/checks", json={"init_data": init_data})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"checks": FAKE_CHECKS}
    m_list.assert_called_once_with(777)
print("PASS: /api/checks lists the caller's saved analysis history")

# --- Test 2: get returns full detail for an owned check ---
with mock.patch.object(db, "ensure_user"), \
     mock.patch.object(db, "get_analysis", return_value=FAKE_CHECK_DETAIL) as m_get:
    resp = client.post("/api/checks/get", json={"init_data": init_data, "analysis_id": 1})
    assert resp.status_code == 200, resp.text
    assert resp.json() == FAKE_CHECK_DETAIL
    m_get.assert_called_once_with(777, 1)
print("PASS: get returns full detail (ats/xyz/tools/level/roadmap_items) for a check the caller owns")

# --- Test 3: get on a not-owned/nonexistent check -> 404, no leak ---
with mock.patch.object(db, "ensure_user"), \
     mock.patch.object(db, "get_analysis", return_value=None):
    resp = client.post("/api/checks/get", json={"init_data": init_data, "analysis_id": 999})
    assert resp.status_code == 404, resp.text
print("PASS: get on a not-owned/nonexistent check returns 404")

# --- Test 4: delete succeeds for an owned check ---
with mock.patch.object(db, "ensure_user"), \
     mock.patch.object(db, "delete_analysis", return_value=True) as m_del:
    resp = client.post("/api/checks/delete", json={"init_data": init_data, "analysis_id": 1})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": True}
    m_del.assert_called_once_with(777, 1)
print("PASS: delete removes a check the caller owns")

# --- Test 5: delete on a not-owned/nonexistent check -> 404 ---
with mock.patch.object(db, "ensure_user"), \
     mock.patch.object(db, "delete_analysis", return_value=False):
    resp = client.post("/api/checks/delete", json={"init_data": init_data, "analysis_id": 999})
    assert resp.status_code == 404, resp.text
print("PASS: delete on a not-owned/nonexistent check returns 404")

print("\nALL MY CHECKS ENDPOINT CHECKS PASSED")
