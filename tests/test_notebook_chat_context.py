"""Notebook memory controls must change actual model input and checkpoint data."""

import sqlite3
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.sqlite import SqliteSaver

from open_notebook.utils.notebook_chat_context import select_history


def exchanges(count):
    return [
        message
        for i in range(count)
        for message in [
            HumanMessage(content=f"question {i}", id=f"human-{i}"),
            AIMessage(content=f"answer {i}", id=f"ai-{i}"),
        ]
    ]


def test_history_keeps_whole_exchanges_and_new_question():
    messages = exchanges(4)
    assert select_history(messages, history_turns=2) == messages[-4:]
    question = HumanMessage(content="new question")
    assert select_history(messages + [question], history_turns=2) == messages[-4:] + [
        question
    ]
    assert select_history(messages + [question], history_turns=0) == [question]
    assert select_history(messages, history_turns=0) == []
    assert len(messages) == 8


def test_restart_cannot_be_undone_by_increasing_window():
    messages = exchanges(4)
    assert select_history(messages, history_start=8, history_turns=None) == []
    new = HumanMessage(content="new")
    assert select_history(messages + [new], history_start=8) == [new]


@pytest.fixture
def memory_api():
    from api.main import app
    from api.routers import chat

    conn = sqlite3.connect(":memory:", check_same_thread=False)
    saver = SqliteSaver(conn)
    graph = chat.chat_graph.builder.compile(checkpointer=saver)
    config = RunnableConfig(configurable={"thread_id": "chat_session:memory-test"})
    graph.update_state(
        config,
        {
            "messages": exchanges(4),
            "context": {"sources": [{"full_text": "private source"}]},
        },
        as_node="agent",
    )
    with (
        patch.object(chat, "chat_graph", graph),
        patch.object(
            chat,
            "get_session_or_404",
            AsyncMock(return_value=("chat_session:memory-test", SimpleNamespace())),
        ),
        patch.object(
            chat, "repo_query", AsyncMock(return_value=[{"out": "notebook:owned"}])
        ),
    ):
        yield TestClient(app), graph, config
    conn.close()


def test_memory_limit_reset_and_physical_clear(memory_api):
    client, graph, config = memory_api
    base = "/api/chat/sessions/memory-test"
    response = client.put(base + "/memory", json={"history_turns": 2})
    assert response.status_code == 200, response.text
    assert response.json()["active_messages"] == 4
    assert response.json()["total_messages"] == 8
    assert response.json()["history_tokens"] > 0
    assert client.post(base + "/memory/reset").json()["active_messages"] == 0
    assert len(graph.get_state(config).values["messages"]) == 8
    assert graph.get_state(config).values["context"] is None
    assert (
        client.put(base + "/memory", json={"history_turns": None}).json()[
            "active_messages"
        ]
        == 0
    )
    graph.update_state(
        config,
        {"messages": exchanges(1)[0].model_copy(update={"id": "new"})},
        as_node="agent",
    )
    assert client.get(base + "/memory").json()["active_messages"] == 1
    assert len(list(graph.get_state_history(config))) > 1
    response = client.delete(base + "/history")
    assert response.status_code == 200, response.text
    assert response.json()["total_messages"] == 0
    # No old snapshots can restore the erased messages or source content.
    for snapshot in graph.get_state_history(config):
        assert not snapshot.values.get("messages")
        assert not snapshot.values.get("context")


def test_memory_request_validates_scope_and_limits(memory_api):
    client, _, _ = memory_api
    base = "/api/chat/sessions/memory-test"
    for count in [-1, 1001]:
        assert (
            client.put(base + "/memory", json={"history_turns": count}).status_code
            == 422
        )
    with patch(
        "api.routers.chat.repo_query", AsyncMock(return_value=[{"out": "source:other"}])
    ):
        assert client.get(base + "/memory").status_code == 400
        assert client.delete(base + "/history").status_code == 400


def test_model_payload_excludes_forgotten_artifacts():
    from open_notebook.graphs.chat import call_model_with_messages

    messages = exchanges(2)
    messages[1].additional_kwargs["response_images"] = [
        {
            "kind": "html",
            "code": "<div>FORGOTTEN HTML</div>",
            "description": "old diagram",
        }
    ]
    messages += [HumanMessage(content="new question")]
    model = SimpleNamespace(invoke=lambda payload: AIMessage(content="answer"))
    with (
        patch(
            "open_notebook.graphs.chat.provision_langchain_model",
            AsyncMock(return_value=model),
        ),
        patch(
            "open_notebook.graphs.chat.run_chat_response",
            side_effect=lambda message, *_: message,
        ),
        patch.object(model, "invoke", wraps=model.invoke) as invoke,
    ):
        call_model_with_messages(
            {
                "messages": messages,
                "history_start": 4,
                "context_config": None,
                "model_override": None,
                "history_turns": None,
                "context": None,
                "notebook": None,
            },
            RunnableConfig(configurable={"thread_id": "chat_session:test"}),
        )
        payload = invoke.call_args.args[0]
        assert [item.content for item in payload[1:]] == ["new question"]
        assert "FORGOTTEN HTML" not in str(payload)


@pytest.mark.asyncio
async def test_disconnect_keeps_lock_until_checkpoint_work_finishes():
    import asyncio
    import threading

    from open_notebook.utils.notebook_chat_context import (
        checkpoint_operation,
        session_operation,
    )

    started = threading.Event()
    finish = threading.Event()
    events = []

    def slow_work():
        started.set()
        assert finish.wait(timeout=3)
        events.append("write")

    async def first():
        async with session_operation("chat_session:concurrent"):
            await checkpoint_operation(slow_work)

    async def second():
        async with session_operation("chat_session:concurrent"):
            events.append("clear")

    task = asyncio.create_task(first())
    await asyncio.to_thread(started.wait, 3)
    task.cancel()
    cleanup = asyncio.create_task(second())
    await asyncio.sleep(0)
    assert not cleanup.done()
    finish.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    await cleanup
    assert events == ["write", "clear"]
