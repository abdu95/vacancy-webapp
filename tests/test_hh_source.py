import asyncio
import sys
import unittest.mock as mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services import hh_source  # noqa: E402

FAKE_ITEMS = [
    {
        "name": "QA Engineer (Manual, Mobile)",
        "employer": {"name": "Ipak Yuli Bank"},
        "area": {"name": "Ташкент"},
        "alternateUrl": "https://hh.ru/vacancy/137038601",
        "snippet": {"requirement": "3-6 years testing experience.", "responsibility": "Run test cycles."},
    },
    {
        "name": "QA Tester",
        "employer": {"name": "Xalq Banki"},
        "area": {"name": "Ташкент"},
        "alternateUrl": "https://hh.ru/vacancy/137034990",
        "snippet": {"requirement": "Manual testing.", "responsibility": "Write test cases."},
    },
    {
        "name": "Senior QA Engineer",
        "employer": {"name": "Ipak Yuli Bank"},  # same employer as item 1 - must be deduped
        "area": {"name": "Ташкент"},
        "alternateUrl": "https://hh.ru/vacancy/999",
        "snippet": {"requirement": "5+ years.", "responsibility": "Lead QA."},
    },
]

# --- Test 1: maps hh's response shape into the shared vacancy shape ---
with mock.patch.object(hh_source, "_fetch_items", new=mock.AsyncMock(return_value=FAKE_ITEMS)):
    results = asyncio.run(hh_source.search_vacancies("QA engineer", "Tashkent", "Any", "Any"))
    assert len(results) == 2, "one per employer - the duplicate Ipak Yuli Bank posting must be dropped"
    assert results[0] == {
        "title": "QA Engineer (Manual, Mobile)",
        "company": "Ipak Yuli Bank",
        "location": "Ташкент",
        "url": "https://hh.ru/vacancy/137038601",
        "summary": "3-6 years testing experience. Run test cycles.",
    }
    assert results[1]["company"] == "Xalq Banki"
print("PASS: search_vacancies maps hh's response into the shared vacancy shape, one per employer")

# --- Test 2: seen_companies is respected (already-shown employers filtered out) ---
with mock.patch.object(hh_source, "_fetch_items", new=mock.AsyncMock(return_value=FAKE_ITEMS)):
    results = asyncio.run(hh_source.search_vacancies("QA engineer", "Tashkent", "Any", "Any",
                                                       seen_companies=["Ipak Yuli Bank"]))
    assert len(results) == 1
    assert results[0]["company"] == "Xalq Banki"
print("PASS: seen_companies filters out employers already shown in a prior search")

# --- Test 3: location resolves to the right hh area id ---
captured_params = {}


async def capture_params(params):
    captured_params.update(params)
    return []


with mock.patch.object(hh_source, "_fetch_items", new=capture_params):
    captured_params.clear()
    asyncio.run(hh_source.search_vacancies("Data Analyst", "Tashkent", "Any", "Any"))
    assert captured_params["area"] == "2759", "Tashkent must resolve to its real hh area id"

    captured_params.clear()
    asyncio.run(hh_source.search_vacancies("Data Analyst", "Any", "Any", "Any"))
    assert captured_params["area"] == "97", "an unset/'Any' location must default to Uzbekistan-wide, not unscoped"

    captured_params.clear()
    asyncio.run(hh_source.search_vacancies("Data Analyst", "Uzbekistan", "Any", "Any"))
    assert captured_params["area"] == "97", "the country's own name must also resolve to Uzbekistan-wide"
print("PASS: location resolves to the correct hh area id for a recognized Uzbekistan location")

# --- Test 3a: city recognition survives real phrasing variation, not just
# the bare city name - real question raised 2026-09-10: "how do we ensure
# a Tashkent search shows Tashkent results, no matter the language?" ---
with mock.patch.object(hh_source, "_fetch_items", new=capture_params):
    for phrasing in (
        "Tashkent",           # en, bare
        "toshkent",           # uz, lowercase
        "Ташкент",            # ru
        "Toshkent shahri",    # uz, "city of Tashkent"
        "Tashkent, Uzbekistan",
        "  Tashkent  ",       # stray whitespace
        "Toshkentda",         # uz locative case ("in Tashkent") - suffix glued directly on, no word break
        "Toshkentga",         # uz dative case ("to Tashkent")
    ):
        captured_params.clear()
        asyncio.run(hh_source.search_vacancies("Data Analyst", phrasing, "Any", "Any"))
        assert captured_params["area"] == "2759", f"'{phrasing}' must still resolve to Tashkent, got {captured_params}"
print("PASS: Tashkent is recognized across real phrasing/language variation, including Uzbek case suffixes")

# --- Test 3b: real bug (2026-09-10) - searching "Project Manager Fashion"
# with location="Europe" silently returned a Tashkent result instead of
# recognizing the search was out of scope for this source. An explicit
# location this source doesn't cover must skip the fetch entirely (empty
# result, no network call), not substitute the wrong country's data. ---
fetch_called = False


async def fail_if_called(params):
    global fetch_called
    fetch_called = True
    return []


with mock.patch.object(hh_source, "_fetch_items", new=fail_if_called):
    for unmapped_location in ("Europe", "Germany", "Remote", "Some Unmapped Village"):
        fetch_called = False
        results = asyncio.run(hh_source.search_vacancies("Project Manager Fashion", unmapped_location, "Any", "Any"))
        assert results == [], f"'{unmapped_location}' must return no results, not substitute Uzbekistan data"
        assert not fetch_called, f"'{unmapped_location}' must not even call hh's API - it's out of scope for this source"
print("PASS: an explicit non-Uzbekistan location is skipped entirely, not silently substituted with Uzbekistan results")

# --- Test 4: never breaks the overall search - a network failure or non-200 returns [] ---
with mock.patch.object(hh_source, "_fetch_items", new=mock.AsyncMock(side_effect=Exception("network down"))):
    results = asyncio.run(hh_source.search_vacancies("QA engineer", "Tashkent", "Any", "Any"))
    assert results == [], "a failure in this provisional source must degrade to empty, never raise"
print("PASS: a fetch failure degrades to an empty result instead of breaking the caller")

# --- Test 5: max_results caps the returned list ---
many_items = [
    {"name": f"QA Engineer {i}", "employer": {"name": f"Company {i}"}, "area": {"name": "Ташкент"},
     "alternateUrl": f"https://hh.ru/vacancy/{i}", "snippet": {}}
    for i in range(10)
]
with mock.patch.object(hh_source, "_fetch_items", new=mock.AsyncMock(return_value=many_items)):
    results = asyncio.run(hh_source.search_vacancies("QA engineer", "Tashkent", "Any", "Any", max_results=3))
    assert len(results) == 3
print("PASS: max_results caps the number of results returned")

# --- Test 6: real bug (2026-09-09) - hh's own search matches against
# description too, which can surface a title with zero real overlap with
# the query. Must exclude those, but keep genuine partial title matches
# (e.g. "QA" alone, a 2-char acronym) that greenhouse_source's own
# stricter >2-char-word filter would have wrongly dropped. ---
mixed_items = [
    {"name": "Software QA Engineer/Intern (AI-Powered)", "employer": {"name": "a1qa"},
     "area": {"name": "Ташкент"}, "alternateUrl": "https://hh.ru/vacancy/1", "snippet": {}},
    {"name": "Senior Java Developer", "employer": {"name": "MUK Computers"},
     "area": {"name": "Ташкент"}, "alternateUrl": "https://hh.ru/vacancy/2", "snippet": {}},
]
with mock.patch.object(hh_source, "_fetch_items", new=mock.AsyncMock(return_value=mixed_items)):
    results = asyncio.run(hh_source.search_vacancies("Java developer", "Tashkent", "Any", "Any"))
    companies = [r["company"] for r in results]
    assert companies == ["MUK Computers"], (
        f"'Software QA Engineer/Intern' has zero title overlap with 'Java developer' and must be excluded, got {companies}"
    )

qa_items = [
    {"name": "QA Tester", "employer": {"name": "Xalq Banki"}, "area": {"name": "Ташкент"},
     "alternateUrl": "https://hh.ru/vacancy/3", "snippet": {}},
]
with mock.patch.object(hh_source, "_fetch_items", new=mock.AsyncMock(return_value=qa_items)):
    results = asyncio.run(hh_source.search_vacancies("QA engineer", "Tashkent", "Any", "Any"))
    assert [r["company"] for r in results] == ["Xalq Banki"], (
        "'QA' is a real 2-char signal (like other tech acronyms: BI, ML, AI) and must not be filtered out"
    )
print("PASS: excludes a title with zero real overlap with the query, without dropping genuine short-acronym matches")

print("\nALL HH_SOURCE CHECKS PASSED")
