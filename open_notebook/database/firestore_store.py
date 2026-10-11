"""Private document storage for the serverless runtime.

Record IDs stay stable across migration. Large payloads are immutable private
Storage objects, so images and long sources never exceed Firestore's 1 MiB limit.
Only server-selected workspace roots are accepted; callers cannot select users.
"""

import asyncio
import hashlib
import json
import os
import re
import uuid
from datetime import datetime
from functools import lru_cache

from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from surrealdb import RecordID

from open_notebook.exceptions import ConfigurationError
from open_notebook.workspaces import current_workspace, platform_selected


def enabled():
    return os.getenv("NEXTNOOTBOOK_DATABASE_BACKEND", "surrealdb") == "firestore"


def credentials():
    if os.getenv("FIRESTORE_EMULATOR_HOST"):
        return AnonymousCredentials()
    from google.oauth2 import service_account

    path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    return service_account.Credentials.from_service_account_file(path) if path else None


@lru_cache(maxsize=1)
def sync_client():
    return firestore.Client(
        project=os.environ["FIREBASE_PROJECT_ID"], credentials=credentials()
    )


# AsyncClient is bound to its event loop. Chat graphs can run in separate threads.
_clients = {}


def client():
    loop = asyncio.get_running_loop()
    if loop not in _clients:
        _clients[loop] = firestore.AsyncClient(
            project=os.environ["FIREBASE_PROJECT_ID"], credentials=credentials()
        )
    return _clients[loop]


def root_path():
    workspace = current_workspace()
    if platform_selected() or workspace is None:
        return "product_platform/default"
    return "product_workspaces/" + workspace.key


def identifier(value):
    return hashlib.sha256(str(value).encode()).hexdigest()


def normalize(value):
    if isinstance(value, RecordID):
        return str(value)
    if isinstance(value, dict):
        return {k: normalize(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize(v) for v in value]
    return value


def pack(data):
    def default(value):
        if isinstance(value, datetime):
            return {"__nextnootbook_datetime__": value.isoformat()}
        raise TypeError(f"Unsupported document value: {type(value).__name__}")

    return json.dumps(
        normalize(data),
        default=default,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()


def unpack(payload):
    def hook(value):
        if set(value) == {"__nextnootbook_datetime__"}:
            return datetime.fromisoformat(value["__nextnootbook_datetime__"])
        return value

    return json.loads(payload, object_hook=hook)


def reference(record_id, db=None):
    record_id = str(record_id)
    table, separator, key = record_id.partition(":")
    if not separator or not key or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table):
        raise ValueError("Invalid record ID")
    return (
        (db or client())
        .document(root_path())
        .collection(table)
        .document(identifier(record_id))
    )


def envelope(data):
    raw = pack(data)
    digest = hashlib.sha256(raw).hexdigest()
    # Index only scalar fields used by native equality lookups. Full records are
    # encoded as bytes to avoid array-of-array restrictions and index explosion.
    meta = {
        k: normalize(v)
        for k, v in data.items()
        if v is None or isinstance(v, (str, bool, int, float, datetime, RecordID))
    }
    meta.pop("full_text", None)
    meta.pop("content", None)
    result = {"record_id": data["id"], "meta": meta, "sha256": digest}
    if len(raw) <= 700000:
        result["payload"] = raw
    else:
        from open_notebook.storage import bucket

        key = f"runtime/{root_path()}/payloads/{digest}.json"
        blob = bucket().blob(key)
        if not blob.exists():
            from google.api_core.exceptions import PreconditionFailed

            try:
                blob.upload_from_string(
                    raw, content_type="application/json", if_generation_match=0
                )
            except PreconditionFailed:
                if hashlib.sha256(blob.download_as_bytes()).hexdigest() != digest:
                    raise ConfigurationError(
                        "Concurrent payload checksum mismatch"
                    ) from None
        result["payload_object"] = key
    return result


def decode(value):
    if not value:
        return None
    raw = value.get("payload")
    if raw is None:
        from open_notebook.storage import bucket

        key = value["payload_object"]
        if not key.startswith(f"runtime/{root_path()}/payloads/"):
            raise ConfigurationError("Document payload belongs to another workspace")
        raw = bucket().blob(key).download_as_bytes()
    if hashlib.sha256(raw).hexdigest() != value["sha256"]:
        raise ConfigurationError("Document checksum mismatch")
    return unpack(raw)


async def get(record_id):
    snapshot = await reference(record_id).get()
    return (
        await asyncio.to_thread(decode, snapshot.to_dict()) if snapshot.exists else None
    )


async def put(record_id, data, *, merge=False, create=False):
    ref = reference(record_id)
    # Optimistic transaction prevents a partial update overwriting another writer.
    transaction = client().transaction()

    @firestore.async_transactional
    async def write(tx):
        snapshot = await ref.get(transaction=tx)
        if create and snapshot.exists:
            raise ValueError("Record already exists")
        previous = (
            await asyncio.to_thread(decode, snapshot.to_dict())
            if snapshot.exists
            else None
        )
        record = (
            {**(previous or {}), **normalize(data), "id": str(record_id)}
            if merge
            else {**normalize(data), "id": str(record_id)}
        )
        value = await asyncio.to_thread(envelope, record)
        tx.set(ref, value)
        return record

    return await write(transaction)


async def delete(record_id):
    await reference(record_id).delete()


async def records(table, filters=()):
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table):
        raise ValueError("Invalid table")
    query = client().document(root_path()).collection(table)
    for field, operator, value in filters:
        query = query.where(
            filter=FieldFilter("meta." + field, operator, normalize(value))
        )
    # Explicit fail, never truncate silently. The MVP ceiling bounds scans and
    # memory while retaining embeddings with any dimension from the old database.
    ceiling = int(os.getenv("NEXTNOOTBOOK_FIRESTORE_SCAN_LIMIT", "20000"))
    snapshots = [s async for s in query.limit(ceiling + 1).stream()]
    if len(snapshots) > ceiling:
        raise ConfigurationError("Workspace exceeds the configured search capacity")
    return [await asyncio.to_thread(decode, s.to_dict()) for s in snapshots]


async def create(table, data):
    now = datetime.now().astimezone()
    rid = f"{table}:{uuid.uuid4().hex}"
    return await put(rid, {**data, "created": now, "updated": now}, create=True)
