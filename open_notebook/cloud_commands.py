"""Durable Cloud Tasks queue with signed private workspace execution.

The task contains only a job ID. Arguments and results stay in private Firestore.
A lease prevents overlapping deliveries; completed jobs are never replayed.
"""

import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from google.cloud import firestore, tasks_v2
from surreal_commands import registry
from surreal_commands.core.types import ExecutionContext

from open_notebook.database import firestore_store as store
from open_notebook.exceptions import ConfigurationError, NotFoundError
from open_notebook.workspaces import platform_scope


def submit(app, name, args, context):
    from open_notebook.workspace_commands import _signature

    if (
        not context
        or not context.get("workspace")
        or context.get("signature") != _signature(context["workspace"])
    ):
        raise ConfigurationError("Cloud jobs require a signed account context")
    item = registry.get_command(app, name)
    item.input_schema.model_validate(args)
    if not os.getenv("NEXTNOOTBOOK_WORKER_URL") or not os.getenv(
        "NEXTNOOTBOOK_TASKS_SERVICE_ACCOUNT"
    ):
        raise ConfigurationError("Cloud worker and task identity must be configured")
    rid = "command:" + uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    record = {
        "id": rid,
        "app": app,
        "name": name,
        "args": args,
        "context": context,
        "status": "queued",
        "created": now,
        "updated": now,
        "attempts": 0,
        "enqueue_pending": True,
        "result": None,
        "error_message": None,
    }
    with platform_scope():
        ref = store.reference(rid, store.sync_client())
        ref.create(store.envelope(record))
    try:
        enqueue(rid)
    except Exception:
        # The durable outbox retains the ID even after an ambiguous timeout.
        # Status polling retries the identical task name; it cannot create a
        # second delivery with a different job ID.
        pass
    return rid


def enqueue(rid):
    from google.api_core.exceptions import AlreadyExists

    project = os.environ["FIREBASE_PROJECT_ID"]
    location = os.environ.get("NEXTNOOTBOOK_TASKS_REGION", "us-east1")
    queue = os.environ.get("NEXTNOOTBOOK_TASKS_QUEUE", "study-jobs")
    url = os.environ["NEXTNOOTBOOK_WORKER_URL"]
    service_account = os.environ["NEXTNOOTBOOK_TASKS_SERVICE_ACCOUNT"]
    client = tasks_v2.CloudTasksClient()
    task = {
        "name": client.task_path(project, location, queue, rid.split(":")[1]),
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": url.rstrip("/") + "/internal/commands/run",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"job_id": rid}).encode(),
            "oidc_token": {
                "service_account_email": service_account,
                "audience": url.rstrip("/"),
            },
        },
        "dispatch_deadline": {"seconds": 1800},
    }
    try:
        client.create_task(
            parent=client.queue_path(project, location, queue), task=tasks_v2.Task(task)
        )
    except AlreadyExists:
        pass


async def status(job_id):
    with platform_scope():
        row = await store.get(job_id)
    if not row:
        raise NotFoundError("Job not found")
    if row.get("enqueue_pending") and row["status"] == "queued":
        try:
            await asyncio.to_thread(enqueue, job_id)
        except Exception:
            row["error_message"] = (
                "Processing is waiting for the queue. It will retry automatically."
            )
        else:
            with platform_scope():
                row = await store.put(job_id, {"enqueue_pending": False}, merge=True)
    return SimpleNamespace(**{"result": None, "error_message": None, **row})


async def cancel(job_id):
    with platform_scope():
        ref = store.reference(job_id)

        @firestore.async_transactional
        async def cancel_pending(tx):
            snapshot = await ref.get(transaction=tx)
            row = await asyncio.to_thread(store.decode, snapshot.to_dict())
            if not row:
                raise NotFoundError("Job not found")
            if row["status"] != "queued":
                return False
            row.update(status="cancelled", enqueue_pending=False)
            tx.set(ref, await asyncio.to_thread(store.envelope, row))
            return True

        return await cancel_pending(store.client().transaction())


async def execute(job_id):
    import commands  # noqa: F401

    with platform_scope():
        ref = store.reference(job_id)

        @firestore.async_transactional
        async def claim(tx):
            snapshot = await ref.get(transaction=tx)
            if not snapshot.exists:
                raise NotFoundError("Job not found")
            row = await asyncio.to_thread(store.decode, snapshot.to_dict())
            from open_notebook.workspace_commands import _signature

            context = row.get("context") or {}
            if not context.get("workspace") or context.get("signature") != _signature(
                context["workspace"]
            ):
                raise ConfigurationError("Invalid job account signature")
            if row["status"] in {"completed", "failed", "cancelled"}:
                return None
            now = datetime.now(timezone.utc)
            if row.get("lease_until") and row["lease_until"] > now:
                raise RuntimeError("Job already running")
            if row["status"] == "running":
                # A crashed delivery may already have charged the AI provider.
                # Preserve its history and require an explicit user retry.
                row.update(
                    status="failed",
                    lease_until=None,
                    updated=now,
                    error_message="Processing was interrupted. Review the source before retrying.",
                )
                tx.set(ref, await asyncio.to_thread(store.envelope, row))
                return None
            row.update(
                status="running",
                lease_until=now + timedelta(minutes=31),
                attempts=row.get("attempts", 0) + 1,
                updated=now,
            )
            tx.set(ref, await asyncio.to_thread(store.envelope, row))
            return row

        row = await claim(store.client().transaction())
    if row is None:
        return
    item = registry.get_command(row["app"], row["name"])
    data = item.input_schema.model_validate(row["args"])
    data.execution_context = ExecutionContext(
        command_id=job_id,
        execution_started_at=datetime.now(timezone.utc),
        app_name=row["app"],
        command_name=row["name"],
        user_context=row["context"],
    )
    try:
        output = await item.runnable.ainvoke(data)
        result = output.model_dump() if hasattr(output, "model_dump") else output
        failed = isinstance(result, dict) and result.get("success") is False
        row.update(
            status="failed" if failed else "completed",
            result=result,
            error_message=result.get("error_message") if failed else None,
        )
    except Exception as error:
        maximum = min(3, item.retry_config.max_attempts) if item.retry_config else 1
        permanent = isinstance(
            error, (ValueError, NotFoundError, ConfigurationError)
        ) or (
            item.retry_config
            and item.retry_config.stop_on
            and isinstance(error, tuple(item.retry_config.stop_on))
        )
        row.update(
            status="failed" if permanent or row["attempts"] >= maximum else "queued",
            error_message="Source processing failed. Review the source and try again.",
        )
        with platform_scope():
            row.update(lease_until=None, updated=datetime.now(timezone.utc))
            await store.put(job_id, row)
        if row["status"] == "queued":
            raise RuntimeError("Retryable job failure") from error
        return
    with platform_scope():
        row.update(lease_until=None, updated=datetime.now(timezone.utc))
        await store.put(job_id, row)
