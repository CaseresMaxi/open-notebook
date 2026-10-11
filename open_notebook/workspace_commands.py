"""Carry a signed server-selected workspace through the shared job queue."""

import hashlib
import hmac
import json
from functools import wraps

from surreal_commands import get_command_status as original_status
from surreal_commands import submit_command as original_submit

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.exceptions import ConfigurationError, NotFoundError
from open_notebook.utils.encryption import get_secret_from_env
from open_notebook.workspaces import (
    Workspace,
    current_workspace,
    platform_scope,
    workspace_scope,
)


def _signature(payload):
    secret = get_secret_from_env("OPEN_NOTEBOOK_ENCRYPTION_KEY")
    if not secret:
        raise ConfigurationError("Job signing requires an encryption key")
    return hmac.new(
        secret.encode(), json.dumps(payload, sort_keys=True).encode(), hashlib.sha256
    ).hexdigest()


def submit_command(app, command, args, context=None):
    workspace = current_workspace()
    if workspace:
        payload = {
            "uid": workspace.uid,
            "admin": workspace.admin,
            "legacy": workspace.legacy,
        }
        context = {"workspace": payload, "signature": _signature(payload)}
    from open_notebook.database.firestore_store import enabled

    if enabled():
        from open_notebook.cloud_commands import submit

        return submit(app, command, args, context)
    return original_submit(app, command, args, context=context)


async def get_command_status(job_id):
    workspace = current_workspace()
    if workspace:
        with platform_scope():
            rows = await repo_query(
                "SELECT context FROM $id;", {"id": ensure_record_id(job_id)}
            )
        if (
            not rows
            or rows[0].get("context", {}).get("workspace", {}).get("uid")
            != workspace.uid
        ):
            # Legacy unsigned jobs belong only to the bound installation owner.
            if not workspace.legacy or (
                rows and rows[0].get("context", {}).get("workspace")
            ):
                raise NotFoundError("Job not found")
    from open_notebook.database.firestore_store import enabled

    if enabled():
        from open_notebook.cloud_commands import status

        return await status(job_id)
    return await original_status(job_id)


def workspace_command(function):
    @wraps(function)
    async def scoped(input_data):
        execution = getattr(input_data, "execution_context", None)
        context = getattr(execution, "user_context", None) or {}
        payload = context.get("workspace")
        workspace: Workspace | None
        if payload:
            if not hmac.compare_digest(
                context.get("signature", ""), _signature(payload)
            ):
                raise ValueError("Invalid workspace job signature")
            workspace = Workspace(**payload)
        elif current_workspace():
            workspace = current_workspace()
        else:
            # Existing unsigned local jobs retain their original semantics.
            workspace = None
        with workspace_scope(workspace):
            return await function(input_data)

    return scoped
