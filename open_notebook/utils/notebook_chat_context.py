"""Notebook memory selection and serialization for checkpoint mutations."""

import asyncio
from contextlib import asynccontextmanager
from weakref import WeakValueDictionary

from langchain_core.messages import BaseMessage

_locks: WeakValueDictionary[str, asyncio.Lock] = WeakValueDictionary()


@asynccontextmanager
async def session_operation(session_id: str):
    """Keep a turn and memory changes from overwriting each other's checkpoints."""
    lock = _locks.setdefault(session_id, asyncio.Lock())
    async with lock:
        yield


async def checkpoint_operation(function, *args, **kwargs):
    """Wait for sync checkpoint work even if its HTTP request disconnects."""
    task = asyncio.create_task(asyncio.to_thread(function, *args, **kwargs))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        try:
            await task
        finally:
            raise


def select_history(
    messages: list[BaseMessage],
    history_start: int = 0,
    history_turns: int | None = None,
) -> list[BaseMessage]:
    """Keep whole human-led exchanges and always include the pending question.

    The limit counts previous exchanges, not individual messages. Selection is
    applied before expanding image/quiz metadata, so forgotten artifacts cannot
    re-enter the model's context.
    """
    selected = messages[max(0, history_start) :]
    if history_turns is None:
        return selected
    human_indices = [i for i, message in enumerate(selected) if message.type == "human"]
    pending = bool(selected and selected[-1].type == "human")
    count = history_turns + int(pending)
    if count <= 0 or not human_indices:
        return []
    return selected[human_indices[max(0, len(human_indices) - count)] :]
