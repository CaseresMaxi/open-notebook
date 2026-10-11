"""Copy a verified offline snapshot into the operational Firestore repository.

Never deletes, starts jobs, or changes local configuration. Existing unequal
records abort the copy. Keep the app stopped while taking the final snapshot.
"""

import argparse
import asyncio
import hashlib
import json
import os
import sqlite3
from pathlib import Path
from typing import cast

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.base import get_checkpoint_metadata

from firebase.migrate_personal_data import read_inventory
from open_notebook.database import firestore_store as store
from open_notebook.graphs.firestore_checkpoint import FirestoreSaver
from open_notebook.storage import bucket
from open_notebook.workspaces import Workspace, platform_scope, workspace_scope

SHARED = {
    "credential",
    "model",
    "transformation",
    "speaker_profile",
    "episode_profile",
    "open_notebook",
}


async def copy_record(record):
    existing = await store.get(record["id"])
    if existing is not None:
        if store.pack(existing) != store.pack(record):
            raise ValueError(
                "Destination differs; refusing to overwrite an existing record"
            )
    else:
        await store.put(record["id"], record, create=True)
    restored = await store.get(record["id"])
    if store.pack(restored) != store.pack(record):
        raise ValueError("Record verification failed")


async def migrate(snapshot, uid, execute):
    records, files = read_inventory(snapshot)
    counts = {name: len(rows) for name, rows in records.items()}
    report = {
        "version": 1,
        "records": counts,
        "files": len(files),
        "status": "inventoried",
    }
    if not execute:
        return report
    if os.environ.get("NEXTNOOTBOOK_DATABASE_BACKEND") != "firestore":
        raise ValueError("Explicit Firestore backend required")
    workspace = Workspace(uid, admin=True, legacy=True)
    from open_notebook import firestore_usage

    await asyncio.to_thread(
        firestore_usage.register_account,
        {
            "uid": uid,
            "email": os.getenv("NEXTNOOTBOOK_ADMIN_EMAIL", "maxycaseres5@gmail.com"),
        },
    )
    with workspace_scope(workspace):
        for table, rows in records.items():
            for row in rows:
                await copy_record(row)
                if table in SHARED:
                    with platform_scope():
                        await copy_record(row)
                if table == "command":
                    # Preserve original history in the owner tree. Old pending
                    # jobs are not replayed: processing may already have charged
                    # the provider before the offline snapshot was taken.
                    from open_notebook.workspace_commands import _signature

                    payload = {"uid": uid, "admin": True, "legacy": True}
                    migrated = {
                        **row,
                        "context": {
                            "workspace": payload,
                            "signature": _signature(payload),
                        },
                    }
                    if migrated.get("status") not in {
                        "completed",
                        "failed",
                        "cancelled",
                    }:
                        migrated.update(
                            status="failed",
                            error_message="Historical processing was interrupted. Retry the source if needed.",
                        )
                    with platform_scope():
                        await copy_record(migrated)
        # Uploaded originals retain their exact /app/data-relative identities.
        # Archives, SQLite files and the original export remain in the backup.
        for entry in files:
            relative = entry["path"]
            if not relative.startswith(
                ("data/uploads/", "data/attachments/", "data/podcasts/")
            ):
                continue
            key = f"users/{uid}/files/{relative.removeprefix('data/')}"
            path = snapshot / relative
            blob = bucket().blob(key)
            if blob.exists():
                if (
                    hashlib.sha256(blob.download_as_bytes()).hexdigest()
                    != entry["sha256"]
                ):
                    raise ValueError("Destination file conflicts with the snapshot")
            else:
                blob.metadata = {"sha256": entry["sha256"], "ownerUid": uid}
                blob.upload_from_filename(str(path), if_generation_match=0)
            if hashlib.sha256(blob.download_as_bytes()).hexdigest() != entry["sha256"]:
                raise ValueError("File verification failed")
            quota_path = relative.removeprefix("data/")
            quota_ref = (
                firestore_usage.account(uid)
                .collection("files")
                .document(hashlib.sha256(quota_path.encode()).hexdigest())
            )
            quota_ref.set({"path": quota_path, "bytes": entry["bytes"]})
        account_ref = firestore_usage.account(uid)
        total_bytes = sum(
            item.to_dict()["bytes"] for item in account_ref.collection("files").stream()
        )
        account_ref.set({"storage_bytes": total_bytes}, merge=True)
        saver = FirestoreSaver(workspace)
        checkpoint_count = writes_count = 0
        for path in (snapshot / "data" / "sqlite-db").glob("*.sqlite"):
            with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as connection:
                connection.row_factory = sqlite3.Row
                for row in connection.execute("SELECT * FROM checkpoints"):
                    checkpoint = saver.serde.loads_typed(
                        (row["type"], row["checkpoint"])
                    )
                    metadata = json.loads(row["metadata"])
                    config = {
                        "configurable": {
                            "thread_id": row["thread_id"],
                            "checkpoint_ns": row["checkpoint_ns"],
                            "checkpoint_id": row["parent_checkpoint_id"],
                        }
                    }
                    selected = {
                        "configurable": {
                            **config["configurable"],
                            "checkpoint_id": row["checkpoint_id"],
                        }
                    }
                    existing = saver.get_tuple(selected)
                    expected_metadata = get_checkpoint_metadata(
                        cast(RunnableConfig, config), metadata
                    )
                    if existing is not None:
                        if saver.encode(existing.checkpoint) != saver.encode(
                            checkpoint
                        ) or saver.encode(existing.metadata) != saver.encode(
                            expected_metadata
                        ):
                            raise ValueError(
                                "Destination checkpoint differs; refusing to overwrite"
                            )
                    else:
                        selected = saver.put(config, checkpoint, metadata, {})
                    restored = saver.get_tuple(selected)
                    if saver.encode(restored.checkpoint) != saver.encode(
                        checkpoint
                    ) or saver.encode(restored.metadata) != saver.encode(
                        expected_metadata
                    ):
                        raise ValueError("Checkpoint verification failed")
                    checkpoint_count += 1
                for row in connection.execute("SELECT * FROM writes"):
                    # Preserve the original index, including special negative channels.
                    rid = "checkpoint_write:" + store.identifier(
                        f"{row['thread_id']}|{row['checkpoint_ns']}|{row['checkpoint_id']}|{row['task_id']}|{row['idx']}"
                    )
                    value = saver.serde.loads_typed((row["type"], row["value"]))
                    await copy_record(
                        {
                            "id": rid,
                            "thread": row["thread_id"],
                            "namespace": row["checkpoint_ns"],
                            "checkpoint_id": row["checkpoint_id"],
                            "task_id": row["task_id"],
                            "task_path": "",
                            "index": row["idx"],
                            "channel": row["channel"],
                            "value": saver.encode(value),
                        }
                    )
                    writes_count += 1
        report.update(
            status="verified",
            checkpoints=checkpoint_count,
            checkpoint_writes=writes_count,
        )
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--owner-uid", required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    report = asyncio.run(migrate(args.snapshot.resolve(), args.owner_uid, args.execute))
    destination = args.snapshot / "firestore-runtime-report.json"
    destination.write_text(json.dumps(report, indent=2))
    destination.chmod(0o600)
    print(json.dumps(report))


if __name__ == "__main__":
    main()
