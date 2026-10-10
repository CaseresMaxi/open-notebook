"""Backup preparation must preserve records and detect changed/missing files."""

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "firebase" / f"{name}.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_restore_changes_schema_only_and_retains_original(tmp_path):
    module = load("prepare_surreal_restore")
    source = tmp_path / "original.surrealql"
    destination = tmp_path / "restore.surrealql"
    content = "-- TABLE: exam\nDEFINE FIELD questions ON exam TYPE array<object>;\nDEFINE FIELD questions[*] ON exam TYPE object;\n-- TABLE DATA: exam\nDEFINE FIELD this_is_user_content\n\x1b[2m INFO surreal::cli::export: complete\n"
    source.write_text(content)
    assert module.prepare(source, destination) == 2
    assert source.read_text() == content
    assert "surreal::cli::export" not in destination.read_text()
    assert (
        destination.read_text().split("-- TABLE DATA: exam\n")[1]
        == content.split("-- TABLE DATA: exam\n")[1].split("\x1b[")[0]
    )
    with pytest.raises(ValueError):
        module.prepare(source, source)
    with pytest.raises(ValueError):
        module.prepare(source, destination)


def test_inventory_rejects_modified_file_or_missing_source(tmp_path):
    module = load("migrate_personal_data")
    (tmp_path / "data" / "uploads").mkdir(parents=True)
    asset = tmp_path / "data" / "uploads" / "source.pdf"
    asset.write_bytes(b"original source bytes")
    records = {
        "source": [
            {"id": "source:one", "asset": {"file_path": "/app/data/uploads/source.pdf"}}
        ]
    }
    (tmp_path / "records.json").write_text(json.dumps(records))
    (tmp_path / "database.surrealql").write_text("-- original backup")
    files = [tmp_path / "records.json", tmp_path / "database.surrealql", asset]
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            [
                {
                    "path": str(path.relative_to(tmp_path)),
                    "bytes": path.stat().st_size,
                    "sha256": module.sha256(path),
                }
                for path in files
            ]
        )
    )
    _, inventory = module.read_inventory(tmp_path)
    assert len(inventory) == 3
    asset.write_bytes(b"changed source bytes")
    with pytest.raises(ValueError, match="Snapshot changed"):
        module.read_inventory(tmp_path)
    asset.unlink()
    with pytest.raises(ValueError, match="Missing source file"):
        module.read_inventory(tmp_path)
