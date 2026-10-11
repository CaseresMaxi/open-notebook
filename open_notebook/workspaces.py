"""Server-selected account scopes. Never read workspace IDs from client input."""

import contextvars
import hashlib
import os
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Workspace:
    uid: str
    admin: bool = False
    legacy: bool = False

    @property
    def key(self) -> str:
        return hashlib.sha256(self.uid.encode()).hexdigest()

    @property
    def database(self) -> str:
        return "user_" + self.key


_current: contextvars.ContextVar[Workspace | None] = contextvars.ContextVar(
    "workspace", default=None
)
_platform: contextvars.ContextVar[bool] = contextvars.ContextVar(
    "platform_database", default=False
)


def current_workspace() -> Workspace | None:
    return _current.get()


def platform_selected() -> bool:
    return _platform.get()


@contextmanager
def workspace_scope(workspace: Workspace | None):
    token = _current.set(workspace)
    try:
        yield workspace
    finally:
        _current.reset(token)


@contextmanager
def platform_scope():
    token = _platform.set(True)
    try:
        yield
    finally:
        _platform.reset(token)


def data_root() -> Path:
    root = Path(os.getenv("NEXTNOOTBOOK_DATA_ROOT", "./data")).resolve()
    workspace = current_workspace()
    if workspace and not workspace.legacy:
        root = root / "users" / workspace.key
    root.mkdir(parents=True, exist_ok=True)
    return root


def uploads_folder() -> str:
    root = data_root() / "uploads"
    root.mkdir(parents=True, exist_ok=True)
    return str(root)


def require_owned_path(path: str | Path, *, uploads: bool = False) -> Path:
    from open_notebook.exceptions import InvalidInputError

    resolved = Path(path).resolve()
    root = Path(uploads_folder()) if uploads else data_root()
    if not resolved.is_relative_to(root):
        raise InvalidInputError("File does not belong to this workspace")
    # Legacy owner may access legacy files, but never another account's subtree.
    workspace = current_workspace()
    if workspace and workspace.legacy and resolved.is_relative_to(root / "users"):
        raise InvalidInputError("File does not belong to this workspace")
    return resolved
