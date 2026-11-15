"""Request-shape rules for OpenAI model families, decided from the model id.

Verified against the live API on 2026-11-15 (gpt-5.5, gpt-5.6-*, gpt-6-*,
gpt-6.1-*, o3):

- Every gpt-5+ and o-series model is a reasoning model: it rejects
  ``max_tokens`` (needs ``max_completion_tokens``) and any ``temperature``
  other than 1.
- From gpt-5.6 on, Chat Completions refuses function tools while reasoning
  is on; the Responses API accepts them for every reasoning model.
- ``reasoning_effort="none"`` is rejected by the o-series, the original
  gpt-5 family, gpt-6-astra and gpt-6.1-sol; the others accept it. No model
  accepts ``"max"``; ``"xhigh"`` is the top level.

Rules are written by family and version, not as a list of known ids, so a
new release (gpt-6.2, gpt-7, o5…) is handled without a code change.
"""

import re
from typing import Optional, Tuple

_GPT_VERSION = re.compile(r"^gpt-(\d+)(?:\.(\d+))?(?=$|[-.])")
_O_SERIES = re.compile(r"^o\d")

# Models that reject reasoning_effort="none" (verified 2026-11-15).
_NO_NONE_EFFORT_PREFIXES = ("gpt-6-astra", "gpt-6.1-sol")


def gpt_version(model_name: str) -> Optional[Tuple[int, int]]:
    """(major, minor) of a ``gpt-N[.M]`` id, or None for other ids."""
    match = _GPT_VERSION.match(model_name.lower())
    if not match:
        return None
    return int(match.group(1)), int(match.group(2) or 0)


def is_reasoning_model(model_name: str) -> bool:
    """True for OpenAI reasoning models (o-series and gpt-5 or later)."""
    name = model_name.lower()
    if _O_SERIES.match(name):
        return True
    version = gpt_version(name)
    # gpt-5-chat-latest style ids are the non-reasoning chat variants.
    return version is not None and version >= (5, 0) and "-chat" not in name


def tools_need_responses_api(model_name: str) -> bool:
    """Tool calling for reasoning models goes through the Responses API.

    Chat Completions only refuses tools from gpt-5.6 on, but Responses
    accepts them for every reasoning model and keeps the reasoning state.
    """
    return is_reasoning_model(model_name)


def supports_effort_none(model_name: str) -> bool:
    """Whether the model accepts ``reasoning_effort="none"``."""
    name = model_name.lower()
    if _O_SERIES.match(name) or name.startswith(_NO_NONE_EFFORT_PREFIXES):
        return False
    return gpt_version(name) != (5, 0)


def effort_for_model(model_name: str, effort: str) -> str:
    """Downgrade an unsupported ``"none"`` to the lowest accepted level."""
    if effort == "none" and not supports_effort_none(model_name):
        return "low"
    return effort
