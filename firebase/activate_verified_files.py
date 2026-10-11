"""Connect a verified archival copy to private runtime Storage without removing originals.

The application database remains unchanged. Run after migrate_personal_data.py succeeds.
"""

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

import firebase_admin
from firebase_admin import auth, credentials, storage


def activate(snapshot: Path, project: str, bucket_name: str, email: str):
    report = json.loads((snapshot / "firebase-migration-report.json").read_text())
    if report["status"] != "verified-copy" or report["project"] != project:
        raise ValueError("A verified copy for the selected project is required")
    app = firebase_admin.initialize_app(
        credentials.Certificate(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]),
        {"projectId": project, "storageBucket": bucket_name},
        name="activate-verified-files",
    )
    try:
        user = auth.get_user_by_email(email, app=app)
        if (
            user.uid != report["ownerUid"]
            or not user.email_verified
            or user.disabled
            or (user.custom_claims or {}).get("admin") is not True
        ):
            raise ValueError("The verified snapshot owner must authorize runtime files")
        bucket = storage.bucket(app=app)
        # Compare the entire immutable remote report before using any source object.
        prefix = f"users/{user.uid}/migrations/{report['snapshotHash']}"
        remote = json.loads(
            bucket.blob(f"{prefix}/verified-manifest.json").download_as_bytes()
        )
        if remote != report:
            raise ValueError("Local and remote migration manifests disagree")
        verified = []
        for item in report["files"]:
            relative = Path(item["path"])
            if relative.parts[:2] not in (("data", "uploads"), ("data", "attachments")):
                continue
            if ".." in relative.parts or relative.is_absolute():
                raise ValueError("Unsafe source path")
            source = bucket.blob(item["object"], generation=item["generation"])
            destination = (
                f"users/{user.uid}/files/{relative.relative_to('data').as_posix()}"
            )
            blob = bucket.blob(destination)
            if not blob.exists():
                bucket.copy_blob(
                    source,
                    bucket,
                    new_name=destination,
                    if_generation_match=0,
                    if_source_generation_match=int(item["generation"]),
                )
            blob.reload()
            if (
                int(blob.size or 0) != item["bytes"]
                or (blob.metadata or {}).get("sha256") != item["sha256"]
                or (blob.metadata or {}).get("ownerUid") != user.uid
            ):
                raise ValueError("Runtime source metadata conflicts with verified copy")
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "verification"
                blob.download_to_filename(
                    str(path), if_generation_match=blob.generation, checksum="auto"
                )
                with path.open("rb") as stream:
                    if (
                        hashlib.file_digest(stream, "sha256").hexdigest()
                        != item["sha256"]
                    ):
                        raise ValueError(
                            "Runtime source bytes differ from verified copy"
                        )
            verified.append({**item, "runtimeObject": destination})
        result = {
            "status": "verified-runtime-files",
            "files": verified,
            "originalsRetained": True,
        }
        output = snapshot / "firebase-runtime-files-report.json"
        output.write_text(json.dumps(result, indent=2))
        output.chmod(0o600)
        print(json.dumps({"status": result["status"], "files": len(verified)}))
    finally:
        firebase_admin.delete_app(app)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    activate(args.snapshot.resolve(), args.project, args.bucket, args.email)
