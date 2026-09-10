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
    key = location.strip().lower()
    if key in _UZBEKISTAN_NAMES:
        return _UZBEKISTAN_AREA_ID
    return _CITY_AREA_IDS.get(key)


def _strip_html(text: str) -> str:
    text = html.unescape(html.unescape(text or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _title_overlaps_query(query: str, title: str) -> bool:
    """Deliberately lighter-touch than greenhouse_source's own
    _title_match_tier (word length > 2, best-tier-only): hh's search
    already ranks by relevance server-side against title+description, a
    much better signal than Greenhouse's raw per-company listing, so this
    only needs to catch the true zero-overlap case (a query term matched
    purely from somewhere in the description, e.g. "Java" mentioned once
    in a QA posting's tooling list) - not re-rank or exclude a real
    partial match. Real case caught 2026-09-09: "Java developer" returned
    a "Software QA Engineer/Intern" posting with no title overlap at all.
    Threshold is length >= 2 (not > 2, unlike greenhouse_source) - common
    tech acronyms like "QA", "BI", "ML" are exactly 2 characters and are
    real signal, not noise, in a title match."""
    words = [w for w in query.lower().split() if len(w) >= 2]
    if not words:
        return True
    title_lower = title.lower()
    return any(re.search(rf"\b{re.escape(w)}\b", title_lower) for w in words)


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
