"""Per-turn orchestration shared by the notebook and source chat graphs.

With the Decisions API available, the ordinary answer starts at once while
the routing decision runs alongside it, so the common path never waits on
routing. The speculative answer is only discarded when the decision asks for
something it cannot provide: the visual tool loop (which also gets the
decided reasoning effort), or an inline component the plain answer would
likely skip (restarted with a presentation hint).
Without the Decisions API the historic behaviour stands.
"""

import asyncio
from typing import Any, Awaitable, Callable

from langchain_core.messages import SystemMessage
from loguru import logger

from open_notebook.ai.decisions import (
    TurnDecision,
    apply_effort,
    decide_turn,
    decisions_access,
)
from open_notebook.utils.chat_responses import latest_request, requested_widgets
from open_notebook.utils.chat_visuals import invoke_visual_chat
from open_notebook.utils.text_utils import extract_text_content


def _previous_answer(history: list[Any]) -> str:
    for message in reversed(history):
        if getattr(message, "type", None) == "ai":
            return extract_text_content(message.content)
    return ""


def use_visual_tools(decision: TurnDecision | None, toggle: bool, request: str) -> bool:
    """Enter the slow visual tool loop only when the turn needs it.

    Without a decision the composer toggle or an explicit visual request
    enables the tools. With one, they only allow them: charts, tables and
    other standard shapes stay in the fast single call as inline arc blocks.
    """
    explicit = requested_widgets(request)[0]
    if decision is None:
        return toggle or explicit
    return decision.visual_tools and (toggle or explicit)


async def _cancel(task: asyncio.Task) -> None:
    task.cancel()
    try:
        await task
    except BaseException:
        pass


async def run_turn(
    history: list[Any],
    instructions: str,
    provision: Awaitable[Any],
    *,
    toggle: bool,
    has_sources: bool,
    model_id: str | None,
    source_ids: Callable[[], Awaitable[set[str]]],
) -> Any:
    request = latest_request(history)
    access_task = asyncio.ensure_future(decisions_access())
    model = await provision
    payload = [SystemMessage(content=instructions), *history]

    async def with_tools(model: Any, payload: list) -> Any:
        return await invoke_visual_chat(model, payload, await source_ids(), model_id)

    access = await access_task
    if access is None:
        if use_visual_tools(None, toggle, request):
            return await with_tools(model, payload)
        return await model.ainvoke(payload)

    decision_task = asyncio.ensure_future(
        decide_turn(request, _previous_answer(history), has_sources, access)
    )
    speculative = asyncio.ensure_future(model.ainvoke(payload))
    try:
        decision = await decision_task
    except BaseException:
        await _cancel(speculative)
        raise
    if decision is None:
        if not use_visual_tools(None, toggle, request):
            return await speculative
        await _cancel(speculative)
        return await with_tools(model, payload)
    hinted = [
        SystemMessage(content=instructions + decision.presentation_hint()),
        *history,
    ]
    if use_visual_tools(decision, toggle, request):
        await _cancel(speculative)
        return await with_tools(apply_effort(model, decision.effort), hinted)
    if decision.presentation_hint() and not speculative.done():
        # Models rarely reach for inline components unprompted; a turn that
        # reads best as a chart, table, metrics or steps restarts with the hint.
        await _cancel(speculative)
        logger.info(f"Restarting the answer as {decision.presentation} components")
        return await model.ainvoke(hinted)
    return await speculative
