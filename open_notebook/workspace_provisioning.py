"""Idempotently provision a private database with the existing product schema."""

import asyncio
from collections import OrderedDict

from open_notebook.database.async_migrate import AsyncMigrationManager
from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.workspaces import Workspace, platform_scope, workspace_scope

_locks: dict[str, asyncio.Lock] = {}
_ready: OrderedDict[str, bool] = OrderedDict()


async def ensure_workspace(workspace: Workspace) -> None:
    if workspace.legacy or workspace.key in _ready:
        return
    lock = _locks.setdefault(workspace.key, asyncio.Lock())
    async with lock:
        if workspace.key in _ready:
            return
        with platform_scope():
            templates = await repo_query("SELECT * FROM transformation;")
        with workspace_scope(workspace):
            manager = AsyncMigrationManager()
            await manager.run_migration_up()
            existing = await repo_query("SELECT * FROM workspace:owner;")
            if existing and existing[0].get("uid") != workspace.uid:
                raise ValueError("Workspace owner mismatch")
            if not existing:
                await repo_query(
                    "UPSERT open_notebook:content_settings MERGE $settings;",
                    {
                        "settings": {
                            "default_embedding_option": "always",
                            "auto_delete_files": "no",
                            "default_content_processing_engine_doc": "auto",
                            "default_content_processing_engine_url": "auto",
                            "docling_ocr": True,
                        }
                    },
                )
                for template in templates:
                    data = {k: v for k, v in template.items() if k != "id"}
                    await repo_query(
                        "UPSERT $id CONTENT $data;",
                        {"id": ensure_record_id(template["id"]), "data": data},
                    )
                await repo_query(
                    "UPSERT workspace:owner CONTENT $owner;",
                    {"owner": {"uid": workspace.uid}},
                )
        _ready[workspace.key] = True
        _locks.pop(workspace.key, None)
        if len(_ready) > 512:
            _ready.popitem(last=False)
