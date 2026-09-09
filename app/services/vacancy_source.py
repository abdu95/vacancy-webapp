"""
Vacancy sourcing for the webapp service. Combines two sources as of
2026-09-09:
- greenhouse_source.py - Greenhouse's public per-company API, skews
  VC-backed international tech (see its own docstring for why).
- hh_source.py - hh.uz/hh.ru, the local/regional coverage Greenhouse
  structurally can't reach. Added after a real tester's "QA engineer in
  Tashkent" search returned nothing good from Greenhouse alone - hh.uz
  has dozens of real local matches for exactly that kind of search. See
  hh_source.py's docstring for the caveat on how that source works
  (an undocumented-but-verified-working backend, not a stable published
  API - built to fail gracefully, never break the overall search).

hh.uz results lead (put first) since local relevance is the specific gap
this combination exists to close; Greenhouse fills in the remaining
slots. Deduped by company name across both sources - no reason to show
the same employer twice just because it happened to match on both.
"""

import asyncio

from app.services import greenhouse_source, hh_source


async def search_vacancies(job_title: str, location: str, work_setup: str,
                            industry: str, seen_companies=None, max_results: int = 3) -> list:
    """Returns 0-max_results matches, one per company - the Mini App shows
    these as a browsable carousel rather than forcing one-at-a-time
    "search again" round trips for variety."""
    hh_results, gh_results = await asyncio.gather(
        hh_source.search_vacancies(job_title, location, work_setup, industry, seen_companies=seen_companies),
        greenhouse_source.search_vacancies(job_title, location, work_setup, industry, seen_companies=seen_companies),
    )

    combined = []
    seen_companies_this_call = set()
    for v in hh_results + gh_results:
        key = v["company"].lower()
        if key in seen_companies_this_call:
            continue
        seen_companies_this_call.add(key)
        combined.append(v)
        if len(combined) >= max_results:
            break
    return combined
