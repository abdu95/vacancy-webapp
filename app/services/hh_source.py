"""
Vacancy search backed by hh.uz/hh.ru (HeadHunter), the dominant job board
in Uzbekistan/CIS - the local/regional coverage Greenhouse structurally
can't reach (Greenhouse skews VC-backed international tech; see
greenhouse_source.py's docstring). Real gap this closes: a tester
searched "QA engineer" in Tashkent and got zero good Greenhouse matches -
hh.uz has dozens of real local ones (banks, local tech companies).

Uses `widgets.hh.ru`'s own widget-constructor backend
(`/api/v1/hh-api/vacancies`), NOT `api.hh.ru` directly. Verified
2026-09-09: `api.hh.ru` sits behind DDoS-Guard (an edge-level anti-bot
wall) and returns 403 even with a fully compliant request (proper
User-Agent, matching hh.ru's own documented request-requirements
section) - not an auth problem, an infrastructure one. The widgets
backend is unauthenticated and gets through, live-verified against real
Tashkent postings. Important caveat: this is the widget product's own
internal backend, not a documented/published API endpoint with a
stability contract - could change shape or get blocked without notice.
Treat as provisional, same as any other best-effort external source:
never let a failure here break the overall search, just return nothing
and let the other source(s) carry it. See the tech backlog doc §3.1 for
the full investigation.

No per-vacancy detail endpoint on this backend (`/vacancies/{id}` 404s) -
not needed, since each search result already carries a real
`alternateUrl` pointing at the public hh.ru/hh.uz posting page, which
jd_fetch.py can already pull full JD text from (verified working, clean
extraction, same day this module was built).
"""

import html
import re

import httpx

_BASE = "https://widgets.hh.ru/api/v1/hh-api"
_HEADERS = {"User-Agent": "AcceptedAI/1.0 (abdumalik2014@gmail.com)"}

# area id 97 = Uzbekistan (the whole country) - the default scope only for
# an unset/"Any" location (no preference stated) or the country's own name.
# This source exists specifically for local/regional coverage; broad
# international/remote search is Greenhouse's job. A handful of major
# cities beyond Tashkent are mapped for when a user is specific about
# where they want to work - confirmed real ids via hh's own /areas
# reference, not guessed.
_UZBEKISTAN_AREA_ID = "97"
_UZBEKISTAN_NAMES = {"uzbekistan", "o'zbekiston", "ozbekiston", "узбекистан"}
_CITY_AREA_IDS = {
    "tashkent": "2759", "toshkent": "2759", "ташкент": "2759",
    "samarkand": "2778", "samarqand": "2778", "самарканд": "2778",
    "bukhara": "2781", "buxoro": "2781", "бухара": "2781",
    "namangan": "2779", "наманган": "2779",
    "andijan": "2768", "andijon": "2768", "андижан": "2768",
    "fergana": "2782", "farg'ona": "2782", "фергана": "2782",
    "nukus": "2780", "нукус": "2780",
}


def _resolve_area(location: str) -> str | None:
    """None means "don't search this source at all" - a real bug caught
    2026-09-09: searching "Project Manager Fashion" with location="Europe"
    silently substituted a Tashkent result instead of recognizing the
    request was out of scope. This source only covers Uzbekistan, so an
    explicit, recognizably-different location (a real place name that
    isn't Uzbekistan or one of its cities) must make it bow out entirely
    and let Greenhouse (the actual international/remote source) carry the
    search alone - not quietly substitute the wrong country's results.
    Only a genuinely unset preference ("", "Any") defaults to
    Uzbekistan-wide; an unset preference is not the same as an explicit
    one this source doesn't recognize."""
    if not location or location.strip().lower() == "any":
        return _UZBEKISTAN_AREA_ID
    text = location.strip().lower()

    # Plain substring, not exact equality or word-boundary matching - a
    # real user rarely types the bare city name alone ("Toshkent shahri",
    # "Tashkent city", "Tashkent, Uzbekistan" all need to still resolve).
    # Deliberately not \b-bounded like _title_overlaps_query: Uzbek is
    # agglutinative, so a city name commonly carries a case suffix glued
    # directly on with no word break ("Toshkentda" = "in Tashkent",
    # "Toshkentga" = "to Tashkent") - a word-boundary check would miss
    # exactly the phrasing a real Uzbek-typing user is likely to use.
    # City-name collisions with an unrelated place are unlikely enough in
    # a location field specifically that the tradeoff favors recall here.
    # City check runs first, deliberately more specific than the country
    # check: "Tashkent, Uzbekistan" contains both "tashkent" and
    # "uzbekistan" - the user named a specific city, so that should win
    # over the broader country-wide scope, not the other way around.
    for name, area_id in _CITY_AREA_IDS.items():
        if name in text:
            return area_id
    for name in _UZBEKISTAN_NAMES:
        if name in text:
            return _UZBEKISTAN_AREA_ID
    return None


def _strip_html(text: str) -> str:
    text = html.unescape(html.unescape(text or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# Seniority/generic-role words say little about *which* job it is - "Senior
# Corporate Lawyer" shares "senior" with "Senior Finance Manager" and
# nothing else that matters. Stripped before the overlap check so it's
# decided by the words that actually name the field or role.
_GENERIC_WORDS = {
    "senior", "junior", "middle", "lead", "head", "chief", "principal", "intern",
    "manager", "specialist", "engineer", "officer", "executive", "assistant",
    "associate", "expert", "consultant", "of", "and", "the", "in", "at",
}


def _title_overlaps_query(query: str, title: str) -> bool:
    """hh's search already ranks by relevance server-side against
    title+description, so this only screens out titles that matched purely
    from somewhere in the description. Two real cases:
    2026-09-09 "Java developer" returned "Software QA Engineer/Intern"
    (zero title overlap). 2026-09-19 "Corporate Finance Manager" returned
    "Senior Corporate Lawyer" - one shared word out of two was enough to
    pass an any-word check, though the field is entirely different.
    So: drop generic/seniority words, then require ALL remaining words to
    appear in the title when there are 1-2 of them, or all but one when
    there are 3+ (long titles often carry a qualifier a posting omits).
    A query made only of generic words falls back to any-word matching.
    Threshold is length >= 2 (not > 2, unlike greenhouse_source) - common
    tech acronyms like "QA", "BI", "ML" are exactly 2 characters and are
    real signal, not noise, in a title match."""
    words = [w for w in query.lower().split() if len(w) >= 2]
    if not words:
        return True
    distinctive = [w for w in words if w not in _GENERIC_WORDS]
    title_lower = title.lower()
    if not distinctive:
        return any(re.search(rf"\b{re.escape(w)}\b", title_lower) for w in words)
    hits = sum(bool(re.search(rf"\b{re.escape(w)}\b", title_lower)) for w in distinctive)
    needed = len(distinctive) if len(distinctive) <= 2 else len(distinctive) - 1
    return hits >= needed


def _build_summary(snippet: dict) -> str:
    parts = [snippet.get("requirement") or "", snippet.get("responsibility") or ""]
    return _strip_html(" ".join(p for p in parts if p))[:400]


async def _fetch_items(params: dict) -> list:
    """Isolated seam for tests to mock directly (same pattern
    greenhouse_source.py's _fetch_company_jobs uses) rather than reaching
    into httpx.AsyncClient's context-manager machinery."""
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(f"{_BASE}/vacancies", params=params, headers=_HEADERS)
        if resp.status_code != 200:
            return []
        return resp.json().get("items", [])


async def search_vacancies(job_title: str, location: str, work_setup: str,
                            industry: str, seen_companies=None, max_results: int = 3) -> list:
    """work_setup/industry accepted for interface compatibility with
    greenhouse_source.search_vacancies (same call shape in vacancy_source.py).
    hh's own search matches against full postings (title + description),
    which can surface a posting whose title has nothing to do with the
    query - see _title_overlaps_query's docstring for the real case that
    caught this."""
    area = _resolve_area(location)
    if area is None:
        return []
    seen = {c.lower() for c in (seen_companies or [])}
    params = {"text": job_title, "area": area, "per_page": 20}

    try:
        items = await _fetch_items(params)
    except Exception:
        return []

    picked = []
    seen_this_call = set()
    for item in items:
        if not _title_overlaps_query(job_title, item.get("name", "")):
            continue
        company = (item.get("employer") or {}).get("name") or ""
        if not company or company.lower() in seen or company.lower() in seen_this_call:
            continue
        seen_this_call.add(company.lower())
        picked.append({
            "title": item.get("name", ""),
            "company": company,
            "location": (item.get("area") or {}).get("name") or "Not specified",
            "url": item.get("alternateUrl", ""),
            "summary": _build_summary(item.get("snippet") or {}),
        })
        if len(picked) >= max_results:
            break
    return picked
