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

# --- Test 1: get returns the caller's saved criteria ---
with mock.patch.object(db, "ensure_user"), \
     mock.patch.object(db, "get_saved_search", return_value={"job_title": "Data Analyst", "location": "Tashkent", "alerts_enabled": True}) as m_get:
    resp = client.post("/api/saved-search", json={"init_data": init_data})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"job_title": "Data Analyst", "location": "Tashkent", "alerts_enabled": True}
    m_get.assert_called_once_with(777)
print("PASS: /api/saved-search returns the caller's saved criteria")

# --- Test 2: save writes trimmed job_title/location/alerts_enabled ---
with mock.patch.object(db, "ensure_user"), \
     mock.patch.object(db, "save_search_criteria") as m_save:
    resp = client.post("/api/saved-search/save", json={
        "init_data": init_data, "job_title": "  Data Analyst  ", "location": " Tashkent ", "alerts_enabled": True,
    })
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"saved": True}
    m_save.assert_called_once_with(777, "Data Analyst", "Tashkent", True)
print("PASS: save trims whitespace and writes job_title/location/alerts_enabled")

# --- Test 3: turning alerts on with no job title -> 400, no write ---
with mock.patch.object(db, "ensure_user"), \
     mock.patch.object(db, "save_search_criteria") as m_save:
    resp = client.post("/api/saved-search/save", json={
        "init_data": init_data, "job_title": "   ", "location": "", "alerts_enabled": True,
    })
    assert resp.status_code == 400, resp.text
    m_save.assert_not_called()
print("PASS: turning alerts on without a job title is rejected, nothing written")

# --- Test 4: saving with alerts off never requires a job title ---
with mock.patch.object(db, "ensure_user"), \
     mock.patch.object(db, "save_search_criteria") as m_save:
    resp = client.post("/api/saved-search/save", json={
        "init_data": init_data, "job_title": "", "location": "", "alerts_enabled": False,
    })
    assert resp.status_code == 200, resp.text
    m_save.assert_called_once_with(777, "", "", False)
print("PASS: clearing criteria / leaving alerts off doesn't require a job title")

print("\nALL SAVED SEARCH ENDPOINT CHECKS PASSED")
