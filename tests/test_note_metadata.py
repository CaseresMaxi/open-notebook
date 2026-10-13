from unittest.mock import AsyncMock, patch

import pytest

from open_notebook.domain.notebook import Note
from open_notebook.utils.note_metadata import note_metadata


def test_metadata_uses_document_text_without_markers_or_image_data():
    title, description = note_metadata(
        "<!-- open-notebook:study-summary:v1 -->\n# Auditoría de calidad\n\nLa **auditoría** revisa [los procesos](https://example.com). [source:private]\n![Figura](data:image/png;base64,not-a-description)"
    )
    assert title == "Auditoría de calidad"
    assert description == "La auditoría revisa los procesos."


@pytest.mark.asyncio
@pytest.mark.parametrize("title", [None, "Nueva nota", "New note", "Mi título"])
async def test_save_generates_metadata_and_preserves_manual_titles(title):
    note = Note(
        title=title,
        content="# Calidad del software\n\nLos procesos mejoran la calidad.",
    )
    with patch("open_notebook.domain.base.ObjectModel.save", new=AsyncMock()):
        await note.save()
        assert note.title == (
            "Mi título" if title == "Mi título" else "Calidad del software"
        )
        assert note.summary == "Los procesos mejoran la calidad."
        note.content = (
            "# Calidad del software\n\nLas métricas permiten evaluar los procesos."
        )
        await note.save()
        assert note.summary == "Las métricas permiten evaluar los procesos."
