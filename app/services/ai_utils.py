"""
Shared helpers for the AI-facing service modules (cv_analysis.py, scoring.py,
cv_fixes.py, hypothesis.py) - JSON extraction from a Claude text response, and
a sanity-check on self-reported matched/missing keyword claims. Previously
each module had its own copy of the JSON-extraction regex; consolidated here
so there's one place to fix if Claude's output format ever needs handling
changes.
"""

import json
import re

# Maps bot/i18n.py's language codes (also what db.get_user_language()
# returns) to what to actually tell the model. "en" is intentionally
# absent - with_language() is a no-op for it, so English generation is
# byte-for-byte unchanged from before this existed.
_LANGUAGE_NAMES = {
    "uz": "Uzbek (Latin script)",
    "ru": "Russian",
}


def with_language(prompt: str, language: str | None) -> str:
    """Appends a "write your response in {language}" instruction to a
    prompt - single-call native generation, not a separate translate
    pass (see backlog doc: half the cost/latency of generate-then-
    translate, and reads more natural). Only touches the freeform prose
    fields in practice, since every prompt's JSON schema already pins
    its own keys/control values in English regardless of language.
    A no-op for English or an unrecognized/missing language code
    *beyond* the always-on JD instruction below, so pre-existing English
    behavior is otherwise unaffected.

    Also always appends a "don't say JD" instruction, regardless of
    language: the prompts themselves use "JD" throughout as internal
    shorthand (e.g. cv_fixes.py's "<...which JD requirement...>"), and
    real user feedback (2026-09-08 - see
    Accepted AI files/user survey/features_fixes_requested_by_users.md)
    caught the model echoing that literal abbreviation into user-facing
    output ("Проблема: JD требует..."), which isn't self-explanatory to
    someone unfamiliar with recruiting jargon. This is a real-content
    bug independent of language, so it belongs here rather than folded
    into the Russian/Uzbek-only instruction below.
    """
    prompt = prompt + (
        "\n\nNever use the abbreviation \"JD\" anywhere in your output text - "
        "say \"the job description\" or name the actual role instead. JD is "
        "internal shorthand only, not something a candidate reading your "
        "output would recognize."
    )
    name = _LANGUAGE_NAMES.get(language)
    if not name:
        return prompt
    return prompt + (
        f"\n\nWrite every free-text field (verdict, reasoning, issue/after, "
        f"prose sections, etc.) in {name}. Keep JSON keys and any fixed "
        f"control values (like strong/mentioned/not_found) in English exactly "
        f"as specified above - only the natural-language content should "
        f"change."
    )


def with_language_for_fixes(prompt: str, language: str | None) -> str:
    """Variant of with_language() for schemas that pair a verbatim CV quote
    with a rewritten version of it: cv_fixes.py's and cv_analysis.py's
    generate_cv_fixes() ("before"/"after" keys) and analyze_cv()'s XYZ
    rewrites ("original"/"improved" keys).

    with_language() forces every free-text field - including the rewritten
    half of these pairs - into the user's UI language. That's wrong here:
    real user feedback (screenshot, 2026-09-26) showed a Russian-UI user
    whose actual CV bullet is in English getting an English "before" quote
    sitting right above a forced-Russian "after" rewrite - mixed languages
    inside what's meant to read as one matched pair. Here, only the
    explanatory fields (issue/verdict/reasoning) follow the UI
    language; the rewritten half of a quote pair instead follows whatever
    language the quoted original/before is already in, so before/after
    (or original/improved) always match each other, not the UI language.
    """
    prompt = prompt + (
        "\n\nNever use the abbreviation \"JD\" anywhere in your output text - "
        "say \"the job description\" or name the actual role instead. JD is "
        "internal shorthand only, not something a candidate reading your "
        "output would recognize."
    )
    name = _LANGUAGE_NAMES.get(language)
    explain_in = f" in {name}" if name else ""
    return prompt + (
        f"\n\nWrite explanatory free-text fields (\"issue\", \"verdict\", "
        f"\"reasoning\", or other prose commentary){explain_in}. Keep JSON "
        f"keys and any fixed control values (like strong/mentioned/"
        f"not_found) in English exactly as specified above.\n\n"
        f"For \"before\"/\"original\" and \"after\"/\"improved\" pairs: "
        f"never translate or rewrite the \"before\"/\"original\" field - "
        f"copy that CV bullet exactly as it appears, in whatever language "
        f"it's actually written in. Write the matching \"after\"/\"improved\" "
        f"field in THE SAME LANGUAGE as its \"before\"/\"original\" "
        f"counterpart (the CV's own language for that bullet) - NOT "
        f"necessarily the language above - so the pair always reads as one "
        f"natural rewrite rather than mixing languages mid-pair. Only when "
        f"there is no \"before\"/\"original\" text to match (a wholly new "
        f"bullet being added, not a rewrite) should \"after\"/\"improved\" "
        f"fall back to whichever language the candidate's CV is "
        f"predominantly written in."
    )


def cv_jd_content_blocks(cv_text: str, jd_text: str, prompt: str) -> list[dict]:
    """Builds two-block message content for Anthropic's prompt caching:
    the CV+JD prefix (identical across every call in a session - the
    dominant share of input tokens, measured at ~3.4-3.9k of ~3.5-3.9k
    total per call in a real session, see the backlog doc's real
    unit-economics entry) marked cacheable, and the call-specific
    trailing prompt as its own uncached block - it differs every call,
    so folding it into the cached block would just prevent cache hits
    for no benefit.

    Needs `client.beta.prompt_caching.messages.create` (not the plain
    `client.messages.create`) - the pinned SDK version (0.34.0) only
    exposes cache_control support through that namespace. Verified live
    against the real API: a second call with an identical CV+JD prefix
    reads from cache (usage.cache_read_input_tokens > 0) instead of
    paying full price again.
    """
    return [
        {
            "type": "text",
            "text": f"CV:\n{cv_text}\n\nJOB DESCRIPTION:\n{jd_text}\n\n",
            "cache_control": {"type": "ephemeral"},
        },
        {"type": "text", "text": prompt},
    ]


def extract_json(text: str, array: bool = False):
    pattern = r'\[.*\]' if array else r'\{.*\}'
    match = re.search(pattern, text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON found in response: {text[:200]}")
    return json.loads(match.group(0))


def verify_keywords(cv_text: str, matched: list, missing: list) -> tuple[list, list]:
    """Cross-checks Claude's claimed matched/missing keywords against the
    actual CV text (case-insensitive substring match). The model can
    hallucinate a keyword as "matched" that never appears in the CV, or claim
    one is "missing" when it's actually present - both are checkable factual
    claims, unlike the overall score itself (a holistic judgment, deliberately
    left alone here, not recomputed from this check).
    """
    cv_lower = cv_text.lower()

    def present(keyword: str) -> bool:
        return keyword.lower().strip() in cv_lower

    verified_matched = [k for k in matched if present(k)]
    verified_missing = [k for k in missing if not present(k)]
    return verified_matched, verified_missing
