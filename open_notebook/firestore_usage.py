"""Transactional usage reservations shared by every serverless instance.

Synchronous entrypoints match provider callbacks and run in the existing thread
boundaries. Per-account aggregate documents avoid rescanning a monthly ledger.
"""

import hashlib
import os
import uuid
from datetime import datetime, timedelta, timezone

from google.cloud import firestore

from open_notebook.database.firestore_store import identifier, sync_client
from open_notebook.exceptions import NotFoundError, RateLimitError
from open_notebook.workspaces import current_workspace, data_root


def now():
    return datetime.now(timezone.utc)


def month():
    return now().strftime("%Y-%m")


def account(uid):
    return sync_client().collection("product_accounts").document(identifier(uid))


def policy(data):
    from open_notebook.usage import DEFAULT_POLICY

    return {**DEFAULT_POLICY, **(data.get("policy") or {})}


def register_account(user):
    db = sync_client()
    ref = account(user["uid"])
    count_ref = db.document("product_platform/account_count")

    @firestore.transactional
    def register(tx):
        old = ref.get(transaction=tx)
        count = count_ref.get(transaction=tx).to_dict() or {"total": 0}
        if not old.exists:
            maximum = int(os.getenv("NEXTNOOTBOOK_MAX_ACCOUNTS", "4"))
            if count["total"] >= maximum:
                raise RateLimitError(
                    "This private study group is full. Contact the administrator."
                )
            tx.set(count_ref, {"total": count["total"] + 1})
        tx.set(
            ref,
            {"uid": user["uid"], "email": user.get("email"), "name": user.get("name")},
            merge=True,
        )

    register(db.transaction())


def policy_for(uid, db=None):
    return policy(account(uid).get().to_dict() or {})


def set_policy(uid, data):
    ref = account(uid)
    if not ref.get().exists:
        raise NotFoundError("Account not found")
    ref.update({"policy": data})


def accounts():
    result = [
        s.to_dict() for s in sync_client().collection("product_accounts").stream()
    ]
    return [
        {**r, "policy": policy(r)}
        for r in sorted(result, key=lambda r: r.get("email") or "")
    ]


def summary(uid):
    ref = account(uid)
    usage = ref.collection("months").document(month()).get().to_dict() or {}
    data = ref.get().to_dict() or {}
    return {
        "month": month(),
        "used": {
            "tokens": usage.get("tokens", 0),
            "calls": usage.get("calls", 0),
            "images": usage.get("images", 0),
            "storage_bytes": data.get("storage_bytes", 0),
        },
        "limits": policy(data),
    }


def reserve(model, units, kind="language"):
    workspace = current_workspace()
    if not workspace:
        return None
    units = max(1, int(units))
    rid = uuid.uuid4().hex
    ref = account(workspace.uid)
    monthly = ref.collection("months").document(month())
    reservation = sync_client().collection("product_reservations").document(rid)

    @firestore.transactional
    def claim(tx):
        data = ref.get(transaction=tx).to_dict() or {}
        totals = monthly.get(transaction=tx).to_dict() or {
            "tokens": 0,
            "calls": 0,
            "images": 0,
        }
        limits = policy(data)
        active = {
            k: expiry
            for k, expiry in (data.get("active") or {}).items()
            if expiry > now()
        }
        if (
            limits["disabled"]
            or totals["tokens"] + units > limits["monthly_tokens"]
            or totals["calls"] >= limits["monthly_calls"]
            or len(active) >= limits["concurrent_calls"]
            or (kind == "image" and totals["images"] >= limits["monthly_images"])
        ):
            raise RateLimitError(
                "Your study allowance is reached. Try later or contact the administrator."
            )
        active[rid] = now() + timedelta(minutes=30)
        tx.set(ref, {"active": active}, merge=["active"])
        tx.set(
            monthly,
            {
                "tokens": totals["tokens"] + units,
                "calls": totals["calls"] + 1,
                "images": totals["images"] + (kind == "image"),
            },
        )
        tx.create(
            reservation,
            {
                "uid": workspace.uid,
                "month": month(),
                "model": model,
                "kind": kind,
                "units": units,
                "state": "reserved",
                "created": now(),
            },
        )

    claim(sync_client().transaction())
    return rid


def settle(run_id, actual=None, state="completed"):
    if not run_id:
        return
    reservation = sync_client().collection("product_reservations").document(run_id)

    @firestore.transactional
    def finish(tx):
        row = reservation.get(transaction=tx).to_dict()
        if not row or row["state"] != "reserved":
            return
        ref = account(row["uid"])
        data = ref.get(transaction=tx).to_dict() or {}
        monthly = ref.collection("months").document(row["month"])
        totals = monthly.get(transaction=tx).to_dict() or {}
        active = dict(data.get("active") or {})
        active.pop(run_id, None)
        units = max(1, int(actual)) if actual is not None else row["units"]
        tx.set(ref, {"active": active}, merge=["active"])
        tx.set(
            monthly,
            {"tokens": totals.get("tokens", 0) + units - row["units"]},
            merge=True,
        )
        tx.update(reservation, {"state": state, "units": units})

    finish(sync_client().transaction())


def file_key(path):
    # Cache location can differ on another instance; quota identity must not.
    return hashlib.sha256(str(path.relative_to(data_root())).encode()).hexdigest()


def claim_file(path, size):
    from pathlib import Path

    workspace = current_workspace()
    if not workspace:
        return
    ref = account(workspace.uid)
    file = ref.collection("files").document(file_key(Path(path).resolve()))

    @firestore.transactional
    def claim(tx):
        data = ref.get(transaction=tx).to_dict() or {}
        previous = file.get(transaction=tx).to_dict() or {}
        total = data.get("storage_bytes", 0) - previous.get("bytes", 0) + size
        if policy(data)["disabled"] or total > policy(data)["storage_bytes"]:
            raise RateLimitError("Your file storage allowance is reached.")
        tx.set(ref, {"storage_bytes": total}, merge=True)
        tx.set(
            file,
            {"path": str(Path(path).resolve().relative_to(data_root())), "bytes": size},
        )

    claim(sync_client().transaction())


def release_file(path):
    from pathlib import Path

    workspace = current_workspace()
    if not workspace:
        return
    ref = account(workspace.uid)
    file = ref.collection("files").document(file_key(Path(path).resolve()))

    @firestore.transactional
    def release(tx):
        data = ref.get(transaction=tx).to_dict() or {}
        previous = file.get(transaction=tx).to_dict() or {}
        tx.set(
            ref,
            {
                "storage_bytes": max(
                    0, data.get("storage_bytes", 0) - previous.get("bytes", 0)
                )
            },
            merge=True,
        )
        tx.delete(file)

    release(sync_client().transaction())
