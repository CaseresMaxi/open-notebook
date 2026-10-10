"""Copy a private, immutable study snapshot to Firebase and verify every byte.

No deletion and no automatic cutover. Run only after taking an offline snapshot.
A successful archive copy does not replace the runtime SurrealDB repository.
"""

import argparse
import hashlib
import json
import os
import sqlite3
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials, firestore, storage


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_inventory(snapshot: Path):
    records = json.loads((snapshot / "records.json").read_text())
    original = {
        entry["path"]: entry
        for entry in json.loads((snapshot / "manifest.json").read_text())
    }
    files = [snapshot / "database.surrealql", snapshot / "records.json"]
    restore = snapshot / "database.restore.surrealql"
    if restore.is_file():
        files.append(restore)
    data_root = snapshot / "data"
    files.extend(
        path
        for path in data_root.rglob("*")
        if path.is_file() and path.relative_to(data_root).parts[0] != ".cache"
    )
    for file in files:
        relative = str(file.relative_to(snapshot))
        entry = original.get(relative)
        if (
            not entry
            or file.is_symlink()
            or not file.resolve().is_relative_to(snapshot.resolve())
        ):
            raise ValueError(f"Unverified snapshot file: {relative}")
        if file.stat().st_size != entry["bytes"] or sha256(file) != entry["sha256"]:
            raise ValueError(f"Snapshot changed after backup: {relative}")
    for row in records.get("source", []):
        asset_path = (row.get("asset") or {}).get("file_path")
        if asset_path:
            normalized = asset_path.removeprefix("/app/").removeprefix("./")
            if not normalized.startswith("data/") or ".." in Path(normalized).parts:
                raise ValueError(f"Source outside snapshot: {row['id']}")
            if (
                not (snapshot / normalized).is_file()
                or snapshot / normalized not in files
            ):
                raise ValueError(f"Missing source file: {row['id']}")
    for database in (snapshot / "data" / "sqlite-db").glob("*.sqlite"):
        with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as connection:
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("Conversation checkpoint integrity check failed")
    return records, [
        {
            "path": str(path.relative_to(snapshot)),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in sorted(files)
    ]


def migrate(snapshot: Path, project: str, bucket_name: str, email: str, execute: bool):
    records, files = read_inventory(snapshot)
    counts = {table: len(rows) for table, rows in records.items()}
    manifest = {"version": 1, "counts": counts, "files": files}
    digest = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
    local_report = snapshot / "firebase-migration-report.json"
    report = {
        **manifest,
        "snapshotHash": digest,
        "project": project,
        "email": email,
        "status": "inventoried",
    }
    local_report.write_text(json.dumps(report, indent=2))
    local_report.chmod(0o600)
    if not execute:
        print(
            json.dumps(
                {
                    "status": "dry-run",
                    "counts": counts,
                    "files": len(files),
                    "bytes": sum(item["bytes"] for item in files),
                }
            )
        )
        return
    # Explicit service identity, never a CLI credential copied into the application.
    app = firebase_admin.initialize_app(
        credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]),
        {"projectId": project, "storageBucket": bucket_name},
        name="personal-migration",
    )
    user = auth.get_user_by_email(email, app=app)
    if (
        not user.email_verified
        or user.disabled
        or (user.custom_claims or {}).get("admin") is not True
    ):
        raise ValueError("The destination must be the verified administrator account")
    uid = user.uid
    bucket = storage.bucket(app=app)
    bucket.reload()  # Fail before writes if billing/bucket/access is missing.
    db = firestore.client(app=app)
    migration = (
        db.collection("users").document(uid).collection("migrations").document(digest)
    )
    prefix = f"users/{uid}/migrations/{digest}"
    migration.set(
        {"ownerUid": uid, "status": "copying", "counts": counts, "snapshotHash": digest}
    )
    copied = []
    try:
        for item in files:
            path = snapshot / item["path"]
            # Never overwrite an earlier object, including on a resumed transfer.
            blob = bucket.blob(f"{prefix}/{item['path']}")
            if not blob.exists():
                blob.metadata = {"sha256": item["sha256"], "ownerUid": uid}
                blob.upload_from_filename(
                    str(path), if_generation_match=0, checksum="auto"
                )
            blob.reload()
            generation = blob.generation
            temporary = snapshot / ".verification-download"
            try:
                blob.download_to_filename(
                    str(temporary), if_generation_match=generation, checksum="auto"
                )
                if (
                    temporary.stat().st_size != item["bytes"]
                    or sha256(temporary) != item["sha256"]
                ):
                    raise ValueError(f"Cloud verification failed: {item['path']}")
            finally:
                temporary.unlink(missing_ok=True)
            copied.append({**item, "object": blob.name, "generation": generation})
        # Preserve every record and edge in an account-scoped immutable Firestore collection.
        # Large records stay in the verified JSON archive (Firestore has a 1 MiB document limit).
        for table, rows in records.items():
            target = migration.collection(table)
            for row in rows:
                payload = json.dumps(row, sort_keys=True, ensure_ascii=False)
                record_hash = hashlib.sha256(payload.encode()).hexdigest()
                identifier = hashlib.sha256(str(row["id"]).encode()).hexdigest()
                doc = {
                    "ownerUid": uid,
                    "legacyId": str(row["id"]),
                    "sha256": record_hash,
                }
                if len(payload.encode()) < 500_000:
                    doc["payloadJson"] = payload
                else:
                    doc["archiveObject"] = f"{prefix}/records.json"
                target.document(identifier).set(doc)
                actual = target.document(identifier).get().to_dict()
                if actual != doc:
                    raise ValueError(f"Record verification failed: {row['id']}")
            if target.count().get()[0][0].value != len(rows):
                raise ValueError(f"Record count mismatch: {table}")
        report.update({"ownerUid": uid, "status": "verified-copy", "files": copied})
        encoded = json.dumps(report, sort_keys=True).encode()
        final = bucket.blob(f"{prefix}/verified-manifest.json")
        if not final.exists():
            final.upload_from_string(
                encoded, content_type="application/json", if_generation_match=0
            )
        if final.download_as_bytes() != encoded:
            raise ValueError("Final manifest verification failed")
        migration.set(
            {
                "ownerUid": uid,
                "status": "verified-copy",
                "counts": counts,
                "snapshotHash": digest,
                "manifestObject": final.name,
                "runtimeCutover": False,
            }
        )
        db.collection("users").document(uid).set(
            {"email": user.email, "legacySnapshot": digest}, merge=True
        )
    except Exception:
        migration.set({"status": "verification-failed"}, merge=True)
        report["status"] = "verification-failed"
        raise
    finally:
        local_report.write_text(json.dumps(report, indent=2))
        firebase_admin.delete_app(app)
    print(
        json.dumps(
            {
                "status": report["status"],
                "uid": uid,
                "counts": counts,
                "files": len(copied),
                "originalsRetained": True,
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--project", required=True)
    parser.add_argument("--bucket", default="")
    parser.add_argument("--email", required=True)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Copy and verify. Does not delete or switch the runtime.",
    )
    args = parser.parse_args()
    if args.execute and not args.bucket:
        parser.error("--bucket is required with --execute")
    migrate(
        args.snapshot.resolve(), args.project, args.bucket, args.email, args.execute
    )
