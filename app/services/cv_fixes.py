"""
CV fix recommendations against a specific vacancy, self-contained for this
service (deploy isolation - see vacancy_source.py's docstring for why).
Mirrors bot/coach.py's generate_cv_fixes + the Junior/Mid/Senior "CV Fixes"
prompts from bot/prompts.py exactly.

Pre-Junior is deliberately NOT a key here: in the original roadmap,
Pre-Junior's item 1 is a "3-Month Plan", not "CV Fixes" - passing
"Pre-Junior" through unchanged would silently generate the wrong content.
Falls back to the Junior prompt instead (same fallback bot/coach.py's own
ROADMAP_BLOCKS.get(level, ROADMAP_BLOCKS["Junior"]) uses for any
unrecognized level).

The Junior/Mid/Senior "gap analysis" CONTEXT blocks below are the same ones
cv_analysis.py's roadmap uses (app/prompts/analysis.py's ROADMAP_*_CONTEXT) -
imported from there rather than duplicated locally, after an audit
(2026-09-07) found this file had its own byte-for-byte copy that could
silently drift from the canonical one. Only the item template around it
(and this feature's own single-vacancy framing) differs.
"""

import os

import anthropic
from dotenv import load_dotenv

from app.prompts.analysis import (
    ROADMAP_JUNIOR_CONTEXT as _JUNIOR_CONTEXT,
    ROADMAP_MID_CONTEXT as _MID_CONTEXT,
    ROADMAP_SENIOR_CONTEXT as _SENIOR_CONTEXT,
)
from app.services.ai_utils import extract_json

load_dotenv()

client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-4-5"

_ITEM_TEMPLATE = """
The candidate's CV and the target job description (JD) are provided.
{context}
DEPTH: {depth}
LENGTH: each field is ONE tightly worded sentence. No extra commentary.

Return ONLY a JSON array of exactly 5 objects, each with these exact keys:
[
  {{
    "issue": "<one short sentence: which JD requirement this CV bullet understates or misses>",
    "before": "<the exact original CV bullet - empty string \\"\\" if this fix adds something missing entirely, rather than rewriting>",
    "after": "<the rewritten (or new) bullet, max 30 words>"
  }},
  ...
]

No preamble, no markdown fences, no explanation - raw JSON array only.
"""

_PROMPTS = {
    "Junior": _ITEM_TEMPLATE.format(
        context=_JUNIOR_CONTEXT, depth="focus on quantification and clarity, not leadership language."),
    "Mid": _ITEM_TEMPLATE.format(
        context=_MID_CONTEXT, depth="emphasise ownership, business impact, and cross-team work — not just task descriptions."),
    "Senior": _ITEM_TEMPLATE.format(
        context=_SENIOR_CONTEXT, depth="every bullet must show scope, influence, and business outcome — not just execution."),
}


async def generate_cv_fixes(level: str, vacancy: dict, cv_text: str) -> list:
    prompt = _PROMPTS.get(level, _PROMPTS["Junior"])
    jd_text = f"{vacancy['title']} at {vacancy['company']}\n{vacancy['summary']}"
    response = await client.messages.create(
        model=MODEL,
        max_tokens=900,
        temperature=0.3,
        messages=[{
            "role": "user",
            "content": f"CV:\n{cv_text}\n\nJOB DESCRIPTION:\n{jd_text}\n\n{prompt}"
        }],
    )
    text = response.content[0].text
    return extract_json(text, array=True)
