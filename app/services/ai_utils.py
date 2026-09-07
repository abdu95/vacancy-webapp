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
    A no-op for English or an unrecognized/missing language code, so
    existing English behavior is completely unaffected.
    """
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
