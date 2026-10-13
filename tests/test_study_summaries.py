"""Study summaries keep only verified quotes and genuine, correctly placed crops."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from open_notebook import study_summaries
from open_notebook.exceptions import InvalidInputError, NotFoundError
from open_notebook.study_summaries import keep_verified_quotes, place_images

ORIGINAL = "La precisión es la proporción de verdaderos positivos entre los positivos predichos."


def test_only_verbatim_quotes_survive():
    content = "\n".join(
        [
            "## Precisión",
            '> "La precisión es la proporción de verdaderos positivos" [source:a]',
            '> "La precisión mide todo lo bueno del modelo" [source:a]',
            "> Una nota sin comillas se mantiene",
            "Texto normal.",
        ]
    )
    kept = keep_verified_quotes(content, [ORIGINAL])
    assert "verdaderos positivos" in kept
    assert "todo lo bueno" not in kept
    assert "Una nota sin comillas" in kept and "Texto normal." in kept


def test_quote_check_ignores_case_spacing_and_typographic_quotes():
    content = "> “LA  precisión es la proporción\nde verdaderos positivos” [source:a]"
    assert "LA" in keep_verified_quotes(content.replace("\n", " "), [ORIGINAL])


def test_image_markers_match_images():
    assert place_images("a [[image:2]] b [[image:9]] [[image:2]]", 2) == (
        "a [[image:2]] b  \n\n[[image:1]]"
    )
    assert place_images("sin figuras [[image:1]]", 0) == "sin figuras "


@pytest.fixture
def pipeline(monkeypatch):
    saved = {}

    class FakeNote(SimpleNamespace):
        async def save(self):
            saved["note"] = self

        async def add_to_notebook(self, notebook_id):
            saved["notebook"] = notebook_id

    monkeypatch.setattr(study_summaries, "Note", FakeNote)
    monkeypatch.setattr(study_summaries.Notebook, "get", AsyncMock())
    monkeypatch.setattr(
        study_summaries, "_notebook_source_ids", AsyncMock(return_value={"source:a"})
    )
    monkeypatch.setattr(
        study_summaries.Source,
        "get",
        AsyncMock(return_value=SimpleNamespace(title="Métricas", full_text=ORIGINAL)),
    )
    monkeypatch.setattr(study_summaries, "provision_langchain_model", AsyncMock())
    image = SimpleNamespace(model_dump=lambda: {"kind": "source", "page": 3})
    reply = SimpleNamespace(
        content=(
            "## Métricas\n\n"
            '> "La precisión es la proporción de verdaderos positivos" [source:a]\n'
            '> "Cita inventada" [source:a]\n\n[[image:1]]\n*Matriz de confusión*'
        )
    )
    visual = AsyncMock(return_value=reply)
    monkeypatch.setattr(study_summaries, "invoke_visual_chat", visual)
    monkeypatch.setattr(study_summaries, "message_images", lambda _: [image])
    return saved, visual


@pytest.mark.asyncio
async def test_source_summary_saves_verified_quotes_and_crops(pipeline):
    saved, visual = pipeline
    await study_summaries.generate_study_summary(
        "notebook:1", source_id="source:a", language="es-ES", title="Resumen"
    )
    note = saved["note"]
    assert saved["notebook"] == "notebook:1"
    assert note.content.startswith(study_summaries.SUMMARY_MARKER)
    assert "(/sources/source:a)" in note.content
    assert "verdaderos positivos" in note.content
    assert "Cita inventada" not in note.content
    assert "[[image:1]]" in note.content
    assert note.images == [{"kind": "source", "page": 3}]
    assert visual.call_args.args[2] == {"source:a"}


@pytest.mark.asyncio
async def test_topic_summary_uses_matching_sources_only(pipeline, monkeypatch):
    saved, visual = pipeline
    monkeypatch.setattr(
        study_summaries,
        "vector_search",
        AsyncMock(
            return_value=[
                {"id": "source:a", "title": "Métricas", "matches": ["precisión"]},
                {"id": "note:x", "title": "Nota", "matches": ["no"]},
            ]
        ),
    )
    await study_summaries.generate_study_summary("notebook:1", topic="precisión")
    assert visual.call_args.args[2] == {"source:a"}
    assert "/sources/" not in saved["note"].content


@pytest.mark.asyncio
async def test_rejects_foreign_sources_and_ambiguous_requests(pipeline):
    with pytest.raises(NotFoundError):
        await study_summaries.generate_study_summary(
            "notebook:1", source_id="source:other"
        )
    with pytest.raises(InvalidInputError):
        await study_summaries.generate_study_summary("notebook:1")
    with pytest.raises(InvalidInputError):
        await study_summaries.generate_study_summary(
            "notebook:1", source_id="source:a", topic="x"
        )
