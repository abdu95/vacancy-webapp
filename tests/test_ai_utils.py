"""
Tests for app/services/ai_utils.py - the shared JSON-extraction helper and
the matched/missing keyword sanity-check. Existing tests for cv_analysis.py/
scoring.py mock analyze_cv/score_vacancy at the function level, so they never
actually exercise this logic - these tests call it directly, and also drive
the real analyze_cv/score_vacancy with a mocked Anthropic client so the
end-to-end wiring (temperature passed, keywords actually get filtered) is
covered too.
"""

import asyncio
import sys
import unittest.mock as mock
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.ai_utils import extract_json, verify_keywords  # noqa: E402

# --- extract_json ---

assert extract_json('{"a": 1}') == {"a": 1}
assert extract_json('noise before {"a": 1} noise after') == {"a": 1}
assert extract_json('[1, 2, 3]', array=True) == [1, 2, 3]
try:
    extract_json("no json here")
    raise AssertionError("expected ValueError")
except ValueError:
    pass
print("PASS: extract_json pulls a JSON object/array out of surrounding text, raises if none found")

# --- verify_keywords ---

cv_text = "Built ETL pipelines with Python and Airflow, wrote SQL daily."

matched, missing = verify_keywords(cv_text, ["Python", "Java"], ["Airflow", "Kubernetes"])
assert matched == ["Python"], matched
assert missing == ["Kubernetes"], missing
print("PASS: verify_keywords drops a hallucinated 'matched' keyword and a false 'missing' keyword")

matched, missing = verify_keywords(cv_text, ["SQL"], ["Kubernetes"])
assert matched == ["SQL"]
assert missing == ["Kubernetes"]
print("PASS: verify_keywords leaves correct claims untouched")

matched, missing = verify_keywords(cv_text, [], [])
assert matched == [] and missing == []
print("PASS: verify_keywords handles empty lists")


# --- End-to-end: analyze_cv actually calls verify_keywords and passes temperature ---

import os  # noqa: E402
os.environ.setdefault("ANTHROPIC_API_KEY", "dummy")
os.environ.setdefault("DATABASE_URL", "postgresql://fake")

from app.services import cv_analysis, scoring  # noqa: E402


def _fake_response(text: str):
    return SimpleNamespace(content=[SimpleNamespace(text=text)])


async def _run():
    fake_json = (
        '{"ats": {"score": 80, "matched": ["Python", "Java"], "missing": ["Airflow"], "verdict": "ok"}, '
        '"xyz": {"passing": [], "failing": [], "rewrites": []}, '
        '"tools": {}, "level": {"assessment": "Junior", "reasoning": "ok"}}'
    )
    with mock.patch.object(cv_analysis.client, "messages") as m_messages:
        m_messages.create = mock.AsyncMock(return_value=_fake_response(fake_json))
        result = await cv_analysis.analyze_cv("some JD", "Built things with Python, no Airflow ever mentioned")
        call_kwargs = m_messages.create.call_args.kwargs
        assert call_kwargs.get("temperature") == 0.3, call_kwargs
        # "Java" was never in the CV text -> dropped from matched.
        assert "Java" not in result["ats"]["matched"]
        assert "Python" in result["ats"]["matched"]

    fake_score_json = '{"score": 70, "matched": ["Python", "Rust"], "missing": [], "verdict": "ok"}'
    with mock.patch.object(scoring.client, "messages") as m_messages:
        m_messages.create = mock.AsyncMock(return_value=_fake_response(fake_score_json))
        result = await scoring.score_vacancy("Built things with Python only", {"title": "t", "company": "c", "summary": "s"})
        call_kwargs = m_messages.create.call_args.kwargs
        assert call_kwargs.get("temperature") == 0.3, call_kwargs
        assert "Rust" not in result["matched"]
        assert "Python" in result["matched"]


asyncio.run(_run())
print("PASS: analyze_cv and score_vacancy both pin temperature=0.3 and actually filter hallucinated keywords")

print("\nALL AI_UTILS CHECKS PASSED")
