"""Fast per-turn routing with OpenAI's Decisions API.

When an OpenAI credential is configured, one ``POST /v1/decisions`` call
(gpt-6-luna, typically well under a second) answers the routing questions a
chat turn needs before the main model runs: whether the slow visual tool loop
is worth entering, which inline presentation fits, and how much reasoning the
answer deserves. Any failure returns ``None`` so callers keep the heuristic
behaviour; routing must never break or noticeably delay a turn.
"""

import os
import time
from dataclasses import dataclass

import httpx
from loguru import logger

DECISIONS_MODEL = "gpt-6-luna"
TIMEOUT_SECONDS = 2.5
PRESENTATIONS = ("prose", "chart", "table", "metrics", "steps", "mixed")
EFFORTS = ("none", "low", "medium", "high")

_QUESTIONS: list[dict] = [
    {
        "name": "visual_tools",
        "type": "predicate",
        "instructions": (
            "True only if a good answer needs visual tools: looking at or cropping a real "
            "figure, page, diagram or table image from the user's documents, generating an "
            "illustration or photo, or drawing a custom diagram, geometry figure, concept map "
            "or animation. Standard data charts (line, bar, share of a whole), tables, "
            "metrics, progress and step lists do NOT need visual tools."
        ),
    },
    {
        "name": "presentation",
        "type": "choice",
        "instructions": "Which presentation makes the answer clearest for a student.",
        "choices": [
            {
                "value": "prose",
                "description": "Plain explanation, conversation, definitions or short answers.",
            },
            {
                "value": "chart",
                "description": "Numbers over time or across categories, or shares of a whole.",
            },
            {
                "value": "table",
                "description": "Comparing several items across the same attributes.",
            },
            {
                "value": "metrics",
                "description": "A few headline figures or a score against a range.",
            },
            {
                "value": "steps",
                "description": "An ordered process, procedure, chronology or method.",
            },
            {
                "value": "mixed",
                "description": "A long study summary combining several of the above.",
            },
        ],
    },
    {
        "name": "effort",
        "type": "score",
        "instructions": "How much reasoning the answer needs before writing.",
        "levels": [
            {
                "label": "quick",
                "description": "Greeting, thanks, confirmation, a single fact or a direct lookup.",
            },
            {
                "label": "standard",
                "description": "Explaining, summarising or comparing material from the documents.",
            },
            {
                "label": "deep",
                "description": "Multi-step reasoning, math or derivations, problem solving, synthesis across many documents.",
            },
        ],
    },
]


@dataclass(frozen=True)
class TurnDecision:
    visual_tools: bool
    presentation: str
    presentation_confidence: float
    effort: str
    latency_ms: int

    def presentation_hint(self) -> str:
        """Nudge the main model toward an inline component, never force one."""
        if self.presentation == "prose" or self.presentation_confidence < 0.5:
            return ""
        hints = {
            "chart": "a chart: a line, bar, donut or waffle arc block",
            "table": "a table: write it as a table arc block, not a Markdown table",
            "metrics": "metrics or gauge arc blocks for the key figures",
            "steps": "a steps arc block instead of a numbered list",
            "mixed": "one or two arc blocks (table, chart or steps) where they clarify the material",
        }
        return (
            "\n\nPRESENTATION FOR THIS TURN: this answer reads best with "
            + hints[self.presentation]
            + ", placed inline next to the text it supports. Use only data from the context."
        )


def _effort(score: float) -> str:
    # "high" is never chosen: its latency outweighs the gain for study chat.
    if score < 0.6:
        return "none"
    if score < 1.6:
        return "low"
    return "medium"


def parse_answers(answers: list[dict], latency_ms: int) -> TurnDecision | None:
    by_name = {answer.get("name"): answer for answer in answers}
    visual = by_name.get("visual_tools", {})
    presentation = by_name.get("presentation", {})
    effort = by_name.get("effort", {})
    if any(item.get("type") in (None, "refusal") for item in (visual, effort)):
        return None
    choice = presentation.get("choice")
    if presentation.get("type") == "refusal" or choice not in PRESENTATIONS:
        choice, confidence = "prose", 0.0
    else:
        # The chosen option's probability: "confidence" is a separate, much
        # more conservative signal that rarely clears a useful threshold.
        confidence = next(
            (
                float(item.get("probability") or 0.0)
                for item in presentation.get("probabilities") or []
                if item.get("value") == choice
            ),
            float(presentation.get("confidence") or 0.0),
        )
    return TurnDecision(
        visual_tools=float(visual.get("probability") or 0.0) >= 0.5,
        presentation=choice,
        presentation_confidence=confidence,
        effort=_effort(float(effort.get("score") or 0.0)),
        latency_ms=latency_ms,
    )


async def decisions_access() -> tuple[str, str] | None:
    """API key and base URL for the Decisions API, or None when unavailable."""
    if os.environ.get("OPEN_NOTEBOOK_DECISIONS", "on").lower() in ("0", "off", "false"):
        return None
    from open_notebook.domain.credential import Credential

    try:
        credentials = await Credential.get_by_provider("openai")
    except Exception as exc:
        logger.debug(f"Decisions credential lookup failed ({type(exc).__name__})")
        credentials = []
    for credential in credentials:
        config = credential.to_esperanto_config()
        if config.get("api_key"):
            base = (config.get("base_url") or "https://api.openai.com/v1").rstrip("/")
            return config["api_key"], base
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        base = os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1"
        return key, base.rstrip("/")
    return None


def decision_input(
    request: str, previous_answer: str = "", has_sources: bool = False
) -> str:
    parts = [f"Latest student message:\n{request.strip()[:2000]}"]
    if previous_answer.strip():
        parts.append(
            f"Previous assistant answer (excerpt):\n{previous_answer.strip()[:600]}"
        )
    parts.append(
        "The student has documents selected as context."
        if has_sources
        else "No documents are selected as context."
    )
    return "\n\n".join(parts)


async def decide_turn(
    request: str,
    previous_answer: str = "",
    has_sources: bool = False,
    access: tuple[str, str] | None = None,
) -> TurnDecision | None:
    if not request.strip():
        return None
    access = access or await decisions_access()
    if access is None:
        return None
    key, base = access
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{base}/decisions",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": DECISIONS_MODEL,
                    "input": decision_input(request, previous_answer, has_sources),
                    "questions": _QUESTIONS,
                },
            )
        response.raise_for_status()
        answers = response.json().get("answers") or []
    except Exception as exc:
        # Never log the response body: it can echo request content.
        logger.info(
            f"Decisions API unavailable, using heuristics ({type(exc).__name__})"
        )
        return None
    latency_ms = int((time.perf_counter() - started) * 1000)
    decision = parse_answers(answers, latency_ms)
    if decision:
        logger.info(
            f"Turn decision in {latency_ms} ms: visual_tools={decision.visual_tools} "
            f"presentation={decision.presentation} effort={decision.effort}"
        )
    return decision


def apply_effort(model, effort: str):
    """Set reasoning effort per turn on OpenAI GPT-6 chat models only.

    GPT-6 accepts none/low/medium/high (verified); other families accept
    different sets, so they keep their configured effort.
    """
    try:
        from langchain_openai import ChatOpenAI
    except ImportError:  # pragma: no cover - dependency is always installed
        return model
    if effort not in EFFORTS or not isinstance(model, ChatOpenAI):
        return model
    if not str(model.model_name).startswith("gpt-6"):
        return model
    return model.model_copy(update={"reasoning_effort": effort})
