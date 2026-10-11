"""Private source storage. Local by default; Firebase is an explicit backend."""

import hashlib
import os
import tempfile
from functools import lru_cache
from pathlib import Path

from open_notebook.exceptions import ConfigurationError, ExternalServiceError
from open_notebook.usage import claim_file, release_file
from open_notebook.workspaces import current_workspace, data_root, require_owned_path


def cloud_enabled():
    return (
        os.getenv("NEXTNOOTBOOK_STORAGE_BACKEND", "local") == "firebase"
        and current_workspace() is not None
    )


@lru_cache(maxsize=1)
def bucket():
    import firebase_admin
    from firebase_admin import credentials, storage

    name = os.getenv("FIREBASE_STORAGE_BUCKET")
    if not name:
        raise ConfigurationError("Firebase Storage bucket is not configured")
    certificate = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    credential = credentials.Certificate(certificate) if certificate else None
    app = firebase_admin.initialize_app(
        credential,
        {"projectId": os.environ["FIREBASE_PROJECT_ID"]},
        name="nextnootbook-storage",
    )
    return storage.bucket(name, app=app)


def object_key(path):
    resolved = require_owned_path(path)
    workspace = current_workspace()
    if workspace is None:
        raise ConfigurationError("Cloud files require an authenticated workspace")
    return f"users/{workspace.uid}/files/{resolved.relative_to(data_root()).as_posix()}"


def retain_file(path):
    path = require_owned_path(path) if current_workspace() else Path(path)
    claim_file(path, path.stat().st_size)
    if not cloud_enabled():
        return
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    blob = bucket().blob(object_key(path))
    if blob.exists():
        blob.reload()
        if (blob.metadata or {}).get("sha256") != digest:
            raise ExternalServiceError("Remote file conflicts with retained source")
        return
    workspace = current_workspace()
    assert workspace is not None
    blob.metadata = {"sha256": digest, "ownerUid": workspace.uid}
    blob.upload_from_filename(str(path), if_generation_match=0, checksum="auto")
    blob.reload()
    if int(blob.size or 0) != path.stat().st_size:
        raise ExternalServiceError("Remote file verification failed")


def local_file(path):
    path = require_owned_path(path) if current_workspace() else Path(path)
    if path.is_file() or not cloud_enabled():
        return path
    blob = bucket().blob(object_key(path))
    from google.api_core.exceptions import NotFound

    from open_notebook.exceptions import NotFoundError

    try:
        blob.reload()
    except NotFound as error:
        raise NotFoundError("Retained source file was not found") from error
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            tmp = Path(stream.name)
        blob.download_to_filename(str(tmp), checksum="auto")
        if hashlib.sha256(tmp.read_bytes()).hexdigest() != (blob.metadata or {}).get(
            "sha256"
        ):
            raise ExternalServiceError("Remote source hash mismatch")
        os.replace(tmp, path)
    finally:
        if tmp:
            tmp.unlink(missing_ok=True)
    return path


def delete_file(path):
    path = require_owned_path(path) if current_workspace() else Path(path)
    if cloud_enabled():
        blob = bucket().blob(object_key(path))
        if blob.exists():
            blob.reload()
            blob.delete(if_generation_match=blob.generation)
    path.unlink(missing_ok=True)
    release_file(path)


def retain_images(images):
    """Content-addressed private attachments shared by chat and written exam answers."""
    import base64

    workspace = current_workspace()
    if workspace is None:
        return
    for image in images:
        raw = base64.b64decode(image.data_url.split(",", 1)[1], validate=True)
        digest = hashlib.sha256(raw).hexdigest()
        suffix = (
            ".png"
            if image.data_url.startswith("data:image/png")
            else ".webp"
            if image.data_url.startswith("data:image/webp")
            else ".jpg"
        )
        path = data_root() / "attachments" / (digest + suffix)
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            claim_file(path, len(raw))
            temporary = None
            try:
                # Publish only complete bytes, even when two requests retain the same image.
                with tempfile.NamedTemporaryFile(
                    dir=path.parent, delete=False
                ) as stream:
                    temporary = Path(stream.name)
                    stream.write(raw)
                    stream.flush()
                    os.fsync(stream.fileno())
                try:
                    os.link(temporary, path)
                except FileExistsError:
                    pass
            except Exception:
                if not path.exists():
                    release_file(path)
                raise
            finally:
                if temporary:
                    temporary.unlink(missing_ok=True)
        retain_file(path)
