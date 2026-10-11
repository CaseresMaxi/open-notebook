"""Integration contracts. Run only against an explicitly selected demo emulator."""

import os
import uuid

import pytest
from langgraph.checkpoint.base import empty_checkpoint

from open_notebook.database import firestore_store as store
from open_notebook.database.repository import repo_query, repo_update
from open_notebook.graphs.firestore_checkpoint import FirestoreSaver
from open_notebook.workspaces import Workspace, workspace_scope

pytestmark = pytest.mark.skipif(
    not os.getenv("FIRESTORE_EMULATOR_HOST")
    or not os.getenv("FIREBASE_PROJECT_ID", "").startswith("demo-"),
    reason="Requires a demo Firebase emulator; never uses a live project",
)


@pytest.fixture
def workspace(monkeypatch):
    monkeypatch.setenv("NEXTNOOTBOOK_DATABASE_BACKEND", "firestore")
    with workspace_scope(Workspace(uuid.uuid4().hex)) as account:
        yield account


@pytest.mark.asyncio
async def test_records_relations_and_account_isolation(workspace):
    await store.put("notebook:one", {"name": "Study"})
    await store.put("source:one", {"title": "Material", "full_text": "Original"})
    await repo_query(
        "RELATE $source->reference->$target CONTENT $data",
        {
            "source": "source:one",
            "target": "notebook:one",
            "data": {},
        },
    )
    edges = await store.records("reference", [("out", "==", "notebook:one")])
    assert len(edges) == 1 and edges[0]["in"] == "source:one"
    await repo_update("source", "source:one", {"title": "Revised"})
    assert (await store.get("source:one"))["full_text"] == "Original"
    with workspace_scope(Workspace(uuid.uuid4().hex)):
        assert await store.get("source:one") is None
        assert await store.records("reference") == []
    assert (
        await repo_query(
            "SELECT id FROM source WHERE title = $title", {"title": "Revised"}
        )
    )[0]["id"] == "source:one"


@pytest.mark.asyncio
async def test_aggregate_filters_and_cascade(workspace):
    for score in (0.5, 0.9):
        await store.create("exam_attempt", {"exam_id": "exam:one", "score": score})
    result = await repo_query(
        "SELECT exam_id, count() AS attempts, math::max(score) AS best_score FROM exam_attempt GROUP BY exam_id"
    )
    assert result == [{"exam_id": "exam:one", "attempts": 2, "best_score": 0.9}]
    await repo_query("DELETE exam_attempt WHERE exam_id = $exam", {"exam": "exam:one"})
    assert await store.records("exam_attempt") == []


def test_checkpoint_roundtrip_and_idempotent_writes(workspace):
    saver = FirestoreSaver(workspace)
    config = {"configurable": {"thread_id": "session:one"}}
    checkpoint = empty_checkpoint()
    checkpoint["channel_values"] = {"messages": ["preserved"]}
    selected = saver.put(config, checkpoint, {"source": "input", "step": 0}, {})
    saver.put_writes(selected, [("messages", "first")], "task")
    saver.put_writes(selected, [("messages", "duplicate")], "task")
    saved = saver.get_tuple(config)
    assert saved.checkpoint["channel_values"]["messages"] == ["preserved"]
    assert saved.pending_writes == [("task", "messages", "first")]
    assert FirestoreSaver(Workspace(uuid.uuid4().hex)).get_tuple(config) is None
    saver.delete_thread("session:one")
    assert saver.get_tuple(config) is None


def test_usage_reservation_releases_concurrency(workspace):
    from open_notebook import firestore_usage as usage

    usage.register_account({"uid": workspace.uid, "email": "test@example.invalid"})
    first = usage.reserve("model:test", 100)
    usage.settle(first, 25)
    usage.settle(first, 25)
    assert usage.account(workspace.uid).get().to_dict()["active"] == {}
    assert usage.summary(workspace.uid)["used"]["tokens"] == 25


@pytest.mark.asyncio
async def test_job_outbox_retry_and_completed_delivery(workspace, monkeypatch):
    import asyncio
    from types import SimpleNamespace

    from langchain_core.runnables import RunnableLambda
    from pydantic import BaseModel

    from open_notebook import cloud_commands
    from open_notebook.workspace_commands import _signature
    from open_notebook.workspaces import current_workspace

    monkeypatch.setenv("OPEN_NOTEBOOK_ENCRYPTION_KEY", "emulator-job-signing-key")
    monkeypatch.setenv("NEXTNOOTBOOK_WORKER_URL", "https://worker.example.invalid")
    monkeypatch.setenv("NEXTNOOTBOOK_TASKS_SERVICE_ACCOUNT", "tasks@example.invalid")

    class Input(BaseModel):
        execution_context: object = None

    calls = []

    async def operation(data):
        # Real commands use the same wrapper to restore their signed scope.
        from open_notebook.workspace_commands import workspace_command

        @workspace_command
        async def inner(value):
            calls.append(current_workspace().uid)
            return {"success": True}

        return await inner(data)

    item = SimpleNamespace(
        input_schema=Input, runnable=RunnableLambda(operation), retry_config=None
    )
    monkeypatch.setattr(cloud_commands.registry, "get_command", lambda *args: item)
    delivered = []

    def enqueue(job):
        delivered.append(job)
        if len(delivered) == 1:
            raise TimeoutError("Acceptance was ambiguous")

    monkeypatch.setattr(cloud_commands, "enqueue", enqueue)
    payload = {"uid": workspace.uid, "admin": False, "legacy": False}
    context = {"workspace": payload, "signature": _signature(payload)}
    job = await asyncio.to_thread(cloud_commands.submit, "test", "test", {}, context)
    assert (await cloud_commands.status(job)).status == "queued"
    assert delivered == [job, job]
    await cloud_commands.execute(job)
    await cloud_commands.execute(job)
    assert calls == [workspace.uid]
    assert (await cloud_commands.status(job)).status == "completed"
    from datetime import datetime, timedelta, timezone

    from open_notebook.workspaces import platform_scope

    interrupted = await asyncio.to_thread(
        cloud_commands.submit, "test", "test", {}, context
    )
    with platform_scope():
        await store.put(
            interrupted,
            {
                "status": "running",
                "lease_until": datetime.now(timezone.utc) - timedelta(seconds=1),
            },
            merge=True,
        )
    await cloud_commands.execute(interrupted)
    assert (await cloud_commands.status(interrupted)).status == "failed"
    assert calls == [workspace.uid]


@pytest.mark.asyncio
async def test_large_payload_integrity_and_cross_account_reference(
    workspace, monkeypatch
):
    from google.auth.credentials import AnonymousCredentials
    from google.cloud import storage

    import open_notebook.storage as files
    from open_notebook.exceptions import ConfigurationError

    host = os.getenv("STORAGE_EMULATOR_HOST")
    if not host:
        pytest.skip("Requires the Storage emulator")
    project = os.environ["FIREBASE_PROJECT_ID"]
    bucket = storage.Client(project=project, credentials=AnonymousCredentials()).bucket(
        project + ".appspot.com"
    )
    monkeypatch.setattr(files, "bucket", lambda: bucket)
    content = "Verified study text " * 50000
    await store.put("source:large", {"full_text": content})
    assert (await store.get("source:large"))["full_text"] == content
    snapshot = (await store.reference("source:large").get()).to_dict()
    assert "payload_object" in snapshot
    with workspace_scope(Workspace(uuid.uuid4().hex)):
        await store.reference("source:large").set(snapshot)
        with pytest.raises(ConfigurationError, match="another workspace"):
            await store.get("source:large")
