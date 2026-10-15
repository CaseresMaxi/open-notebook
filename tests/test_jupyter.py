import json
from types import SimpleNamespace

import pytest

from open_notebook.ai import notebook_tutor
from open_notebook.utils.jupyter import (
    NotebookError,
    is_notebook_path,
    load_notebook,
    notebook_cells,
    notebook_language,
    notebook_text,
    output_text,
)

NOTEBOOK = {
    "nbformat": 4,
    "metadata": {"kernelspec": {"language": "python", "name": "python3"}},
    "cells": [
        {"cell_type": "markdown", "source": ["# Análisis\n", "Exploramos."]},
        {
            "cell_type": "code",
            "execution_count": 3,
            "source": "df.head()",
            "outputs": [
                {
                    "output_type": "execute_result",
                    "data": {
                        "text/plain": ["   a\n", "0  1"],
                        "text/html": "<table></table>",
                        "application/vnd.custom": "x",
                    },
                },
                {
                    "output_type": "stream",
                    "name": "stdout",
                    "text": "\x1b[31mhola\x1b[0m",
                },
                {"output_type": "display_data", "data": {"image/png": "iVBO\nRw0"}},
                {
                    "output_type": "error",
                    "ename": "KeyError",
                    "evalue": "'b'",
                    "traceback": ["\x1b[1mKeyError\x1b[0m"],
                },
            ],
        },
        {"cell_type": "raw", "source": "texto crudo"},
    ],
}


def test_reads_cells_and_outputs():
    notebook = load_notebook(json.dumps(NOTEBOOK).encode())
    cells = notebook_cells(notebook)
    assert [cell["type"] for cell in cells] == ["markdown", "code", "raw"]
    code = cells[1]
    assert code["execution_count"] == 3 and code["source"] == "df.head()"
    display, stream, image, error = code["outputs"]
    assert display["data"] == {
        "text/plain": "   a\n0  1",
        "text/html": "<table></table>",
    }
    assert stream["text"] == "hola"
    assert image["data"]["image/png"] == "iVBORw0"
    assert error["traceback"] == "KeyError"
    assert notebook_language(notebook) == "python"


def test_text_for_chat_and_search():
    text = notebook_text(load_notebook(json.dumps(NOTEBOOK)))
    assert "# Análisis" in text and "```python\ndf.head()\n```" in text
    assert "hola" in text and "[figure]" in text and "KeyError: 'b'" in text
    assert output_text([]) == ""


def test_rejects_other_files():
    with pytest.raises(NotebookError):
        load_notebook(b"%PDF-1.4")
    with pytest.raises(NotebookError):
        load_notebook(b'{"cells": "no"}')
    assert is_notebook_path("/x/Clase.IPYNB") and not is_notebook_path("/x/a.pdf")


@pytest.mark.asyncio
async def test_explanations_cover_only_code_cells(monkeypatch):
    seen = []

    class Model:
        async def ainvoke(self, payload):
            seen.append(payload[1].content)
            return SimpleNamespace(
                content=json.dumps(
                    {
                        "cells": [
                            {"index": 1, "explanation": " Muestra las filas. "},
                            {"index": 0, "explanation": "markdown"},
                            {"index": 9, "explanation": "inventada"},
                        ]
                    }
                )
            )

    async def provision(*args, **kwargs):
        return Model()

    monkeypatch.setattr(notebook_tutor, "provision_langchain_model", provision)
    cells = notebook_cells(load_notebook(json.dumps(NOTEBOOK)))
    result = await notebook_tutor.explain_cells(cells, "python", "es-ES")
    assert result == {1: "Muestra las filas."}
    assert "[[cell 1 · code]]" in seen[0] and "[[cell 0 · markdown]]" in seen[0]


def test_long_notebooks_are_split_and_markdown_only_parts_skipped(monkeypatch):
    monkeypatch.setattr(notebook_tutor, "CHUNK_CHARS", 60)
    cells = [
        {"index": 0, "type": "markdown", "source": "x" * 80, "outputs": []},
        {"index": 1, "type": "code", "source": "a = 1", "outputs": []},
        {"index": 2, "type": "code", "source": "b = 2" * 20, "outputs": []},
    ]
    chunks = notebook_tutor._chunks(cells, "python")
    assert len(chunks) == 2
    assert all("· code]]" in chunk for chunk in chunks)
