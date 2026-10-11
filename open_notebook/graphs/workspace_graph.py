"""Bounded graph cache with one SQLite checkpoint store per private workspace."""

import sqlite3
import threading
from collections import OrderedDict
from pathlib import Path

from langgraph.checkpoint.sqlite import SqliteSaver

from open_notebook.workspaces import current_workspace, data_root


class WorkspaceGraph:
    def __init__(self, builder, legacy_graph):
        self.builder = builder
        self.legacy_graph = legacy_graph
        self._graphs = OrderedDict()
        self._lock = threading.Lock()

    def selected(self):
        workspace = current_workspace()
        from open_notebook.database.firestore_store import enabled

        if enabled():
            if workspace is None:
                raise ValueError("Cloud chat requires an authenticated workspace")
            key = "firestore:" + workspace.key
            with self._lock:
                if key not in self._graphs:
                    from open_notebook.graphs.firestore_checkpoint import FirestoreSaver

                    self._graphs[key] = self.builder.compile(
                        checkpointer=FirestoreSaver(workspace)
                    )
                    if len(self._graphs) > 128:
                        self._graphs.popitem(last=False)
                return self._graphs[key]
        if not workspace or workspace.legacy:
            return self.legacy_graph
        key = workspace.key
        with self._lock:
            if key not in self._graphs:
                folder = data_root() / "sqlite-db"
                folder.mkdir(parents=True, exist_ok=True)
                conn = sqlite3.connect(
                    str(Path(folder) / "checkpoints.sqlite"), check_same_thread=False
                )
                conn.execute("PRAGMA journal_mode=WAL")
                # Do not close an evicted connection: an active stream may still own its graph.
                self._graphs[key] = self.builder.compile(checkpointer=SqliteSaver(conn))
                if len(self._graphs) > 128:
                    self._graphs.popitem(last=False)
            else:
                self._graphs.move_to_end(key)
            return self._graphs[key]

    def __getattr__(self, name):
        return getattr(self.selected(), name)
