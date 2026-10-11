"""Durable, account-scoped LangGraph checkpoints without a local disk."""

import asyncio
import base64
from contextlib import contextmanager
from typing import cast

from google.cloud.firestore_v1.base_query import FieldFilter
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import (
    WRITES_IDX_MAP,
    BaseCheckpointSaver,
    CheckpointTuple,
    get_checkpoint_metadata,
)

from open_notebook.database import firestore_store as store
from open_notebook.workspaces import workspace_scope


class FirestoreSaver(BaseCheckpointSaver):
    def __init__(self, workspace):
        super().__init__()
        self.workspace = workspace

    @contextmanager
    def scope(self):
        with workspace_scope(self.workspace):
            yield

    def ref(self, rid):
        return store.reference(rid, store.sync_client())

    def encode(self, value):
        kind, raw = self.serde.dumps_typed(value)
        return {"type": kind, "bytes": base64.b64encode(raw).decode()}

    def decode(self, value):
        return self.serde.loads_typed((value["type"], base64.b64decode(value["bytes"])))

    def records(self, table, thread, namespace=None):
        query = (
            store.sync_client()
            .document(store.root_path())
            .collection(table)
            .where(filter=FieldFilter("meta.thread", "==", thread))
        )
        if namespace is not None:
            query = query.where(filter=FieldFilter("meta.namespace", "==", namespace))
        return [store.decode(s.to_dict()) for s in query.stream()]

    def get_tuple(self, config):
        with self.scope():
            configurable = config["configurable"]
            thread, ns = (
                str(configurable["thread_id"]),
                configurable.get("checkpoint_ns", ""),
            )
            rows = self.records("checkpoint", thread, ns)
            wanted = configurable.get("checkpoint_id")
            if wanted:
                rows = [r for r in rows if r["checkpoint_id"] == wanted]
            if not rows:
                return None
            row = max(rows, key=lambda r: r["checkpoint_id"])
            selected = {
                "configurable": {
                    "thread_id": thread,
                    "checkpoint_ns": ns,
                    "checkpoint_id": row["checkpoint_id"],
                }
            }
            parent = (
                {
                    "configurable": {
                        **selected["configurable"],
                        "checkpoint_id": row["parent"],
                    }
                }
                if row.get("parent")
                else None
            )
            writes = [
                r
                for r in self.records("checkpoint_write", thread, ns)
                if r["checkpoint_id"] == row["checkpoint_id"]
            ]
            writes.sort(
                key=lambda r: (r.get("task_path", ""), r["task_id"], r["index"])
            )
            return CheckpointTuple(
                cast(RunnableConfig, selected),
                self.decode(row["checkpoint"]),
                self.decode(row["metadata"]),
                cast(RunnableConfig | None, parent),
                [(r["task_id"], r["channel"], self.decode(r["value"])) for r in writes],
            )

    def list(self, config, *, filter=None, before=None, limit=None):
        with self.scope():
            if not config:
                raise ValueError("Listing checkpoints requires a thread")
            conf = config["configurable"]
            rows = self.records(
                "checkpoint", str(conf["thread_id"]), conf.get("checkpoint_ns")
            )
            rows.sort(key=lambda r: r["checkpoint_id"], reverse=True)
            emitted = 0
            for row in rows:
                if (
                    before
                    and row["checkpoint_id"] >= before["configurable"]["checkpoint_id"]
                ):
                    continue
                metadata = self.decode(row["metadata"])
                if filter and any(metadata.get(k) != v for k, v in filter.items()):
                    continue
                if limit is not None and emitted >= limit:
                    break
                yield self.get_tuple(
                    {
                        "configurable": {
                            "thread_id": row["thread"],
                            "checkpoint_ns": row["namespace"],
                            "checkpoint_id": row["checkpoint_id"],
                        }
                    }
                )
                emitted += 1

    def put(self, config, checkpoint, metadata, new_versions):
        conf = config["configurable"]
        thread, ns, cp_id = (
            str(conf["thread_id"]),
            conf.get("checkpoint_ns", ""),
            checkpoint["id"],
        )
        record = {
            "id": "checkpoint:" + store.identifier(f"{thread}|{ns}|{cp_id}"),
            "thread": thread,
            "namespace": ns,
            "checkpoint_id": cp_id,
            "parent": conf.get("checkpoint_id"),
            "checkpoint": self.encode(checkpoint),
            "metadata": self.encode(get_checkpoint_metadata(config, metadata)),
        }
        with self.scope():
            self.ref(record["id"]).set(store.envelope(record))
        return {
            "configurable": {
                "thread_id": thread,
                "checkpoint_ns": ns,
                "checkpoint_id": cp_id,
            }
        }

    def put_writes(self, config, writes, task_id, task_path=""):
        conf = config["configurable"]
        thread, ns, cp_id = (
            str(conf["thread_id"]),
            conf.get("checkpoint_ns", ""),
            conf["checkpoint_id"],
        )
        with self.scope():
            for index, (channel, value) in enumerate(writes):
                position = WRITES_IDX_MAP.get(channel, index)
                rid = "checkpoint_write:" + store.identifier(
                    f"{thread}|{ns}|{cp_id}|{task_id}|{position}"
                )
                record = {
                    "id": rid,
                    "thread": thread,
                    "namespace": ns,
                    "checkpoint_id": cp_id,
                    "task_id": task_id,
                    "task_path": task_path,
                    "index": position,
                    "channel": channel,
                    "value": self.encode(value),
                }
                ref = self.ref(rid)
                # Ordinary writes are immutable, matching SqliteSaver's INSERT
                # OR IGNORE. Special error/interrupt writes can be updated.
                if position >= 0:
                    from google.api_core.exceptions import AlreadyExists

                    try:
                        ref.create(store.envelope(record))
                    except AlreadyExists:
                        pass
                else:
                    ref.set(store.envelope(record))

    def delete_thread(self, thread_id):
        with self.scope():
            for table in ("checkpoint", "checkpoint_write"):
                for row in self.records(table, str(thread_id)):
                    self.ref(row["id"]).delete()

    async def aget_tuple(self, config):
        return await asyncio.to_thread(self.get_tuple, config)

    async def alist(self, config, *, filter=None, before=None, limit=None):
        rows = await asyncio.to_thread(
            lambda: list(self.list(config, filter=filter, before=before, limit=limit))
        )
        for row in rows:
            yield row

    async def aput(self, config, checkpoint, metadata, new_versions):
        return await asyncio.to_thread(
            self.put, config, checkpoint, metadata, new_versions
        )

    async def aput_writes(self, config, writes, task_id, task_path=""):
        await asyncio.to_thread(self.put_writes, config, writes, task_id, task_path)

    async def adelete_thread(self, thread_id):
        await asyncio.to_thread(self.delete_thread, thread_id)
