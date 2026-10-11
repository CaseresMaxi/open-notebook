"""Durable atomic per-account budgets shared by the API and background workers."""

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from open_notebook.exceptions import RateLimitError
from open_notebook.workspaces import current_workspace

DEFAULT_POLICY = {
    "monthly_tokens": 500000,
    "monthly_calls": 1000,
    "monthly_images": 30,
    "concurrent_calls": 3,
    "storage_bytes": 500 * 1024 * 1024,
    "model_id": None,
    "disabled": False,
}


@contextmanager
def connection():
    path = Path(os.getenv("NEXTNOOTBOOK_USAGE_DB", "./data/platform/usage.sqlite"))
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""CREATE TABLE IF NOT EXISTS accounts(uid TEXT PRIMARY KEY, email TEXT, name TEXT, policy TEXT);
    CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY, uid TEXT NOT NULL, month TEXT NOT NULL, model TEXT,
    kind TEXT NOT NULL, units INTEGER NOT NULL, state TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS ledger_account ON ledger(uid, month);
    CREATE TABLE IF NOT EXISTS files(uid TEXT NOT NULL, path TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(uid,path));""")
    try:
        with db:
            yield db
    finally:
        db.close()


def month():
    return datetime.now(timezone.utc).strftime("%Y-%m")


def register_account(user):
    with connection() as db:
        db.execute(
            "INSERT INTO accounts(uid,email,name) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET email=excluded.email,name=excluded.name",
            (user["uid"], user.get("email"), user.get("name")),
        )


def policy_for(uid, db=None):
    if db is None:
        with connection() as conn:
            return policy_for(uid, conn)
    row = db.execute("SELECT policy FROM accounts WHERE uid=?", (uid,)).fetchone()
    return {
        **DEFAULT_POLICY,
        **(json.loads(row["policy"]) if row and row["policy"] else {}),
    }


def set_policy(uid, policy):
    with connection() as db:
        changed = db.execute(
            "UPDATE accounts SET policy=? WHERE uid=?", (json.dumps(policy), uid)
        ).rowcount
        if not changed:
            from open_notebook.exceptions import NotFoundError

            raise NotFoundError("Account not found")


def accounts():
    with connection() as db:
        return [
            {**dict(row), "policy": policy_for(row["uid"], db)}
            for row in db.execute("SELECT uid,email,name FROM accounts ORDER BY email")
        ]


def summary(uid):
    with connection() as db:
        row = db.execute(
            "SELECT coalesce(sum(units),0) tokens,count(*) calls,coalesce(sum(kind='image'),0) images FROM ledger WHERE uid=? AND month=?",
            (uid, month()),
        ).fetchone()
        storage = db.execute(
            "SELECT coalesce(sum(bytes),0) total FROM files WHERE uid=?", (uid,)
        ).fetchone()["total"]
        return {
            "month": month(),
            "used": {**dict(row), "storage_bytes": storage},
            "limits": policy_for(uid, db),
        }


def reserve(model, units, kind="language"):
    workspace = current_workspace()
    if not workspace:
        return None
    units = max(1, int(units))
    run_id = uuid.uuid4().hex
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        # Crashed calls retain their charge, but cannot hold concurrency slots forever.
        db.execute(
            "UPDATE ledger SET state='abandoned' WHERE uid=? AND state='reserved' AND created < datetime('now','-30 minutes')",
            (workspace.uid,),
        )
        policy = policy_for(workspace.uid, db)
        totals = db.execute(
            "SELECT coalesce(sum(units),0) tokens,count(*) calls,coalesce(sum(kind='image'),0) images FROM ledger WHERE uid=? AND month=?",
            (workspace.uid, month()),
        ).fetchone()
        active = db.execute(
            "SELECT count(*) n FROM ledger WHERE uid=? AND state='reserved'",
            (workspace.uid,),
        ).fetchone()["n"]
        if (
            policy["disabled"]
            or totals["tokens"] + units > policy["monthly_tokens"]
            or totals["calls"] >= policy["monthly_calls"]
            or active >= policy["concurrent_calls"]
            or (kind == "image" and totals["images"] >= policy["monthly_images"])
        ):
            raise RateLimitError(
                "Your study allowance is reached. Try later or contact the administrator."
            )
        db.execute(
            "INSERT INTO ledger(id,uid,month,model,kind,units,state) VALUES(?,?,?,?,?,?,'reserved')",
            (run_id, workspace.uid, month(), model, kind, units),
        )
    return run_id


def settle(run_id, actual=None, state="completed"):
    if run_id is None:
        return
    with connection() as db:
        if actual is None:
            db.execute(
                "UPDATE ledger SET state=? WHERE id=? AND state='reserved'",
                (state, run_id),
            )
        else:
            db.execute(
                "UPDATE ledger SET state=?,units=? WHERE id=? AND state='reserved'",
                (state, max(1, int(actual)), run_id),
            )


@contextmanager
def metered(model, units, kind="language"):
    run_id = reserve(model, units, kind)
    try:
        yield
    except BaseException:
        # Failed, cancelled or uncertain calls retain their reservation conservatively.
        settle(run_id, state="failed")
        raise
    else:
        settle(run_id)


def claim_file(path, size):
    workspace = current_workspace()
    if not workspace:
        return
    with connection() as db:
        db.execute("BEGIN IMMEDIATE")
        policy = policy_for(workspace.uid, db)
        used = db.execute(
            "SELECT coalesce(sum(bytes),0) n FROM files WHERE uid=? AND path != ?",
            (workspace.uid, str(path)),
        ).fetchone()["n"]
        if policy["disabled"] or used + size > policy["storage_bytes"]:
            raise RateLimitError("Your file storage allowance is reached.")
        db.execute(
            "INSERT OR REPLACE INTO files(uid,path,bytes) VALUES(?,?,?)",
            (workspace.uid, str(path), size),
        )


def release_file(path):
    workspace = current_workspace()
    if workspace:
        with connection() as db:
            db.execute(
                "DELETE FROM files WHERE uid=? AND path=?", (workspace.uid, str(path))
            )
