"""Search contracts for incomplete sources and preserved embedding dimensions."""

import pytest

from open_notebook.database import firestore_queries as queries


@pytest.mark.asyncio
async def test_pending_source_does_not_break_search(monkeypatch):
    async def records(table, filters=()):
        return {
            "source": [{"id": "source:pending", "title": None, "full_text": None}],
            "note": [{"id": "note:one", "title": "Study", "content": "gradient"}],
        }.get(table, [])

    monkeypatch.setattr(queries.store, "records", records)
    result = await queries.search(
        {"source": True, "note": True, "keyword": "gradient", "results": 10},
        vector=False,
    )
    assert len(result) == 1
    assert result[0]["id"] == "note:one"
    assert result[0]["content"] == "gradient"


@pytest.mark.asyncio
async def test_existing_vectors_above_native_firestore_dimension_limit(monkeypatch):
    vector = [1.0] * 3072

    async def records(table, filters=()):
        return {
            "source": [{"id": "source:one", "title": "Original"}],
            "source_embedding": [
                {
                    "id": "source_embedding:one",
                    "source": "source:one",
                    "content": "Faithful source excerpt",
                    "embedding": vector,
                }
            ],
        }.get(table, [])

    monkeypatch.setattr(queries.store, "records", records)
    result = await queries.search(
        {"source": True, "embed": vector, "minimum_score": 0.9, "results": 10},
        vector=True,
    )
    assert len(result) == 1
    assert result[0]["id"] == "source:one"
    assert result[0]["content"] == "Faithful source excerpt"
    assert result[0]["similarity"] == pytest.approx(1.0)
