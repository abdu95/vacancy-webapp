"""
CV-vs-vacancy scoring, self-contained for this service (deploy isolation -
see vacancy_source.py's docstring for why). Mirrors bot/coach.py's
score_vacancy exactly.
"""

import os

import anthropic
from dotenv import load_dotenv

from app.services.ai_utils import MODEL, NO_THINKING, cv_jd_content_blocks, extract_json, verify_keywords, with_language, response_text

load_dotenv()

client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

VACANCY_SCORE_PROMPT = """
You will receive a candidate CV and a job description.

Compare them and return ONLY a JSON object:
{
  "score": <integer 0-100>,
  "matched": [<up to 6 keywords found in both CV and JD>],
  "missing": [<up to 6 important JD keywords absent from CV>],
  "verdict": "<1 sentence honest assessment>"
}

No preamble. Raw JSON only.
"""


async def score_vacancy(cv_text: str, vacancy: dict, language: str = "en") -> dict:
    jd_text = f"{vacancy['title']} at {vacancy['company']}\n{vacancy['summary']}"
    prompt = with_language(VACANCY_SCORE_PROMPT, language)
    response = await client.messages.create(
        model=MODEL,
        max_tokens=400,
        thinking=NO_THINKING,
        output_config={"effort": "low"},
        messages=[{"role": "user", "content": cv_jd_content_blocks(cv_text, jd_text, prompt)}],
    )
    result = extract_json(response_text(response))
    result["matched"], result["missing"] = verify_keywords(
        cv_text, result.get("matched", []), result.get("missing", [])
    )
    return result
