"""
CV-vs-JD analysis engine (ATS score, XYZ formula check, tool radar, level
assessment, roadmap), self-contained for this service (deploy isolation -
see vacancy_source.py's docstring for why). Mirrors bot/coach.py's
analyze_cv/generate_cv_fixes/generate_roadmap/roadmap_block_title/
roadmap_max_item exactly, using analysis_prompts.py in place of bot/prompts.py.

Distinct from app/services/cv_fixes.py's generate_cv_fixes(level, vacancy, cv_text)
- that one rewrites a CV against one already-found vacancy (a different,
lighter feature); this generate_cv_fixes(level, jd, cv_text) is roadmap item 1
of the full JD-analysis flow. Both are kept, not merged.
"""

import os

import anthropic
from dotenv import load_dotenv

from app.prompts.analysis import ANALYSIS_PROMPT, ROADMAP_BLOCKS
from app.services.ai_utils import cv_jd_content_blocks, extract_json, verify_keywords, with_language

load_dotenv()

client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-4-5"


async def analyze_cv(jd: str, cv_text: str, language: str = "en") -> dict:
    """Full analysis: ats, xyz, tools, level."""
    prompt = with_language(ANALYSIS_PROMPT, language)
    response = await client.beta.prompt_caching.messages.create(
        model=MODEL,
        max_tokens=2000,
        temperature=0.3,
        messages=[{"role": "user", "content": cv_jd_content_blocks(cv_text, jd, prompt)}]
    )
    result = extract_json(response.content[0].text)
    result["ats"]["matched"], result["ats"]["missing"] = verify_keywords(
        cv_text, result["ats"].get("matched", []), result["ats"].get("missing", [])
    )
    return result


def roadmap_block_title(level: str, item: int) -> str:
    blocks = ROADMAP_BLOCKS.get(level, ROADMAP_BLOCKS["Junior"])
    return blocks[item]["title"]


def roadmap_max_item(level: str) -> int:
    blocks = ROADMAP_BLOCKS.get(level, ROADMAP_BLOCKS["Junior"])
    return max(blocks.keys())


async def generate_cv_fixes(level: str, jd: str, cv_text: str, language: str = "en") -> list:
    """Generate the Top-5 CV fixes as structured data (item 1 of the roadmap)."""
    blocks = ROADMAP_BLOCKS.get(level, ROADMAP_BLOCKS["Junior"])
    block = blocks[1]
    prompt = with_language(block["prompt"], language)
    response = await client.beta.prompt_caching.messages.create(
        model=MODEL,
        max_tokens=block.get("max_tokens", 900),
        temperature=0.3,
        messages=[{"role": "user", "content": cv_jd_content_blocks(cv_text, jd, prompt)}]
    )
    text = "".join(b.text for b in response.content if b.type == "text")
    return extract_json(text, array=True)


async def generate_roadmap_item(level: str, item: int, jd: str, cv_text: str, language: str = "en") -> str:
    """Generate one roadmap action item for the given level."""
    blocks = ROADMAP_BLOCKS.get(level, ROADMAP_BLOCKS["Junior"])
    block = blocks[item]
    prompt = with_language(block["prompt"], language)
    response = await client.beta.prompt_caching.messages.create(
        model=MODEL,
        max_tokens=block.get("max_tokens", 1800),
        temperature=0.3,
        messages=[{"role": "user", "content": cv_jd_content_blocks(cv_text, jd, prompt)}]
    )
    return "".join(b.text for b in response.content if b.type == "text")
