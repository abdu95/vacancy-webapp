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

from app.services.ai_utils import cv_jd_content_blocks, extract_json, verify_keywords, with_language  # noqa: E402

# --- cv_jd_content_blocks ---

blocks = cv_jd_content_blocks("my cv text", "my jd text", "the trailing prompt")
assert len(blocks) == 2
assert blocks[0]["cache_control"] == {"type": "ephemeral"}
assert "my cv text" in blocks[0]["text"] and "my jd text" in blocks[0]["text"]
assert "the trailing prompt" not in blocks[0]["text"], "the varying prompt must not be inside the cached block"
assert blocks[1] == {"type": "text", "text": "the trailing prompt"}
assert "cache_control" not in blocks[1]

blocks_a = cv_jd_content_blocks("same cv", "same jd", "prompt A")
blocks_b = cv_jd_content_blocks("same cv", "same jd", "prompt B")
assert blocks_a[0] == blocks_b[0], "the cacheable block must be byte-identical across calls with the same CV+JD - that's what makes it a cache hit, regardless of which prompt/function is calling"
print("PASS: cv_jd_content_blocks splits CV+JD (cacheable) from the varying prompt (not cached), and the cacheable block is identical for the same CV+JD regardless of the trailing prompt")

# --- with_language ---

# The "don't say JD" instruction is always appended, regardless of language -
# real user feedback caught the model echoing that literal abbreviation
# into output text, a content bug independent of language.
en_prompt = with_language("PROMPT", "en")
assert en_prompt.startswith("PROMPT") and "JD" in en_prompt and "job description" in en_prompt
assert "Russian" not in en_prompt and "Uzbek" not in en_prompt, "English must still get no language instruction"

none_prompt = with_language("PROMPT", None)
assert none_prompt == en_prompt, "no language code should behave exactly like English - JD instruction, no language instruction"

fr_prompt = with_language("PROMPT", "fr")
assert fr_prompt == en_prompt, "an unrecognized code should also behave like English"

ru_prompt = with_language("PROMPT", "ru")
assert ru_prompt != en_prompt and "Russian" in ru_prompt and ru_prompt.startswith(en_prompt)
uz_prompt = with_language("PROMPT", "uz")
assert uz_prompt != en_prompt and "Uzbek" in uz_prompt
print("PASS: with_language always appends the JD instruction, is otherwise a no-op for English/unknown codes, and appends a real language instruction for ru/uz")

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
    with mock.patch.object(cv_analysis.client.beta.prompt_caching, "messages") as m_messages:
        m_messages.create = mock.AsyncMock(return_value=_fake_response(fake_json))
        result = await cv_analysis.analyze_cv("some JD", "Built things with Python, no Airflow ever mentioned")
        call_kwargs = m_messages.create.call_args.kwargs
        assert call_kwargs.get("temperature") == 0.3, call_kwargs
        # "Java" was never in the CV text -> dropped from matched.
        assert "Java" not in result["ats"]["matched"]
        assert "Python" in result["ats"]["matched"]

    fake_score_json = '{"score": 70, "matched": ["Python", "Rust"], "missing": [], "verdict": "ok"}'
    with mock.patch.object(scoring.client.beta.prompt_caching, "messages") as m_messages:
        m_messages.create = mock.AsyncMock(return_value=_fake_response(fake_score_json))
        result = await scoring.score_vacancy("Built things with Python only", {"title": "t", "company": "c", "summary": "s"})
        call_kwargs = m_messages.create.call_args.kwargs
        assert call_kwargs.get("temperature") == 0.3, call_kwargs
        assert "Rust" not in result["matched"]
        assert "Python" in result["matched"]

    # The message content must be the 2-block prompt-caching shape: a
    # cacheable CV+JD block, then the call-specific prompt as its own block.
    with mock.patch.object(cv_analysis.client.beta.prompt_caching, "messages") as m_messages:
        m_messages.create = mock.AsyncMock(return_value=_fake_response(fake_json))
        await cv_analysis.analyze_cv("some JD", "some CV")
        content = m_messages.create.call_args.kwargs["messages"][0]["content"]
        assert isinstance(content, list) and len(content) == 2
        assert content[0]["cache_control"] == {"type": "ephemeral"}
        assert "CV:" in content[0]["text"] and "JOB DESCRIPTION:" in content[0]["text"]
        assert "cache_control" not in content[1], "the varying prompt block must NOT be cached"

    # analyze_cv's default (language="en") must send the exact same prompt
    # content as before language support existed - no behavior change for
    # existing English users.
    with mock.patch.object(cv_analysis.client.beta.prompt_caching, "messages") as m_messages:
        m_messages.create = mock.AsyncMock(return_value=_fake_response(fake_json))
        await cv_analysis.analyze_cv("some JD", "some CV")
        default_content = m_messages.create.call_args.kwargs["messages"][0]["content"]
        m_messages.create.reset_mock()
        await cv_analysis.analyze_cv("some JD", "some CV", "en")
        explicit_en_content = m_messages.create.call_args.kwargs["messages"][0]["content"]
        assert default_content == explicit_en_content
        assert "Russian" not in default_content[1]["text"] and "Uzbek" not in default_content[1]["text"]

    # A non-English language must actually change what gets sent, not just
    # be accepted and silently ignored - and must land in the UNcached
    # prompt block, not leak into the cacheable CV+JD block.
    with mock.patch.object(cv_analysis.client.beta.prompt_caching, "messages") as m_messages:
        m_messages.create = mock.AsyncMock(return_value=_fake_response(fake_json))
        await cv_analysis.analyze_cv("some JD", "some CV", "ru")
        content = m_messages.create.call_args.kwargs["messages"][0]["content"]
        assert "Russian" in content[1]["text"]
        assert "JSON keys" in content[1]["text"], "must tell the model to keep JSON keys/control values in English"
        assert "Russian" not in content[0]["text"], "the language instruction must not leak into the cached CV+JD block"


asyncio.run(_run())
print("PASS: analyze_cv and score_vacancy both pin temperature=0.3 and actually filter hallucinated keywords")
print("PASS: language threads into the real prompt sent to Claude - English unchanged, ru/uz actually different")

print("\nALL AI_UTILS CHECKS PASSED")
