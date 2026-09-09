import asyncio
import sys
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import vacancy_source, hh_source, greenhouse_source  # noqa: E402


def _v(company, title="Some Role"):
    return {"title": title, "company": company, "location": "Tashkent", "url": "https://x/1", "summary": "..."}


# --- Test 1: combines both sources, hh.uz results lead ---
with mock.patch.object(hh_source, "search_vacancies", new=mock.AsyncMock(return_value=[_v("Ipak Yuli Bank")])), \
     mock.patch.object(greenhouse_source, "search_vacancies", new=mock.AsyncMock(return_value=[_v("Stripe")])):
    results = asyncio.run(vacancy_source.search_vacancies("QA Engineer", "Tashkent", "Any", "Any"))
    assert [r["company"] for r in results] == ["Ipak Yuli Bank", "Stripe"], \
        "hh.uz results must lead - it's the source added to fix the local-relevance gap"
print("PASS: combines hh.uz and Greenhouse results, hh.uz first")

# --- Test 2: deduped by company across both sources ---
with mock.patch.object(hh_source, "search_vacancies", new=mock.AsyncMock(return_value=[_v("Scale AI")])), \
     mock.patch.object(greenhouse_source, "search_vacancies", new=mock.AsyncMock(return_value=[_v("Scale AI"), _v("Stripe")])):
    results = asyncio.run(vacancy_source.search_vacancies("Software Engineer", "Any", "Any", "Any"))
    companies = [r["company"] for r in results]
    assert companies == ["Scale AI", "Stripe"], f"got {companies}"
print("PASS: the same employer matching on both sources is only shown once")

# --- Test 3: respects max_results across the combined pool ---
hh_results = [_v(f"HH Co {i}") for i in range(3)]
gh_results = [_v(f"GH Co {i}") for i in range(3)]
with mock.patch.object(hh_source, "search_vacancies", new=mock.AsyncMock(return_value=hh_results)), \
     mock.patch.object(greenhouse_source, "search_vacancies", new=mock.AsyncMock(return_value=gh_results)):
    results = asyncio.run(vacancy_source.search_vacancies("QA Engineer", "Tashkent", "Any", "Any", max_results=4))
    assert len(results) == 4
    assert [r["company"] for r in results] == ["HH Co 0", "HH Co 1", "HH Co 2", "GH Co 0"]
print("PASS: max_results caps the combined pool, still hh.uz-first")

# --- Test 4: one source failing doesn't take down the other (hh_source already
# degrades internally, but confirm the combination survives it too) ---
with mock.patch.object(hh_source, "search_vacancies", new=mock.AsyncMock(return_value=[])), \
     mock.patch.object(greenhouse_source, "search_vacancies", new=mock.AsyncMock(return_value=[_v("Stripe")])):
    results = asyncio.run(vacancy_source.search_vacancies("QA Engineer", "Tashkent", "Any", "Any"))
    assert [r["company"] for r in results] == ["Stripe"]
print("PASS: an empty hh.uz result still leaves Greenhouse's results intact")

# --- Test 5: seen_companies is threaded through to both sources ---
with mock.patch.object(hh_source, "search_vacancies", new=mock.AsyncMock(return_value=[])) as m_hh, \
     mock.patch.object(greenhouse_source, "search_vacancies", new=mock.AsyncMock(return_value=[])) as m_gh:
    asyncio.run(vacancy_source.search_vacancies("QA Engineer", "Tashkent", "Any", "Any", seen_companies=["Stripe"]))
    assert m_hh.call_args.kwargs["seen_companies"] == ["Stripe"]
    assert m_gh.call_args.kwargs["seen_companies"] == ["Stripe"]
print("PASS: seen_companies is threaded through to both sources")

print("\nALL VACANCY_SOURCE CHECKS PASSED")
