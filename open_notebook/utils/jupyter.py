"""Jupyter notebooks (.ipynb) as study sources.

The original file is kept as the source asset. Its text (Markdown, code and
textual outputs) becomes the source's full text for chat and search, and the
normalised cells feed the in-app notebook viewer, where the code runs in the
student's browser (Pyodide), never on the server.
"""

import json
import re
from typing import Any

MAX_NOTEBOOK_BYTES = 40 * 1024 * 1024
MAX_IMAGE_CHARS = 3_000_000  # base64 characters per saved image output
MAX_TEXT_OUTPUT_CHARS = 20_000
TEXT_MIMES = ("text/plain", "text/html", "text/markdown", "text/latex")
IMAGE_MIMES = ("image/png", "image/jpeg", "image/svg+xml")
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


class NotebookError(ValueError):
    """The file is not a readable Jupyter notebook."""


def is_notebook_path(path: str | None) -> bool:
    return bool(path) and str(path).lower().endswith(".ipynb")


def _text(value: Any) -> str:
    if isinstance(value, list):
        return "".join(str(part) for part in value)
    return "" if value is None else str(value)


def _clip(text: str, limit: int = MAX_TEXT_OUTPUT_CHARS) -> str:
    return text if len(text) <= limit else text[:limit] + "\n…"


def load_notebook(raw: bytes | str) -> dict:
    if isinstance(raw, bytes):
        if len(raw) > MAX_NOTEBOOK_BYTES:
            raise NotebookError("The notebook is too large to open")
        raw = raw.decode("utf-8", errors="replace")
    try:
        notebook = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise NotebookError("The file is not a valid Jupyter notebook") from exc
    if not isinstance(notebook, dict) or not isinstance(notebook.get("cells"), list):
        raise NotebookError("The file is not a valid Jupyter notebook")
    return notebook


def _output(raw: dict) -> dict | None:
    kind = raw.get("output_type")
    if kind == "stream":
        return {
            "type": "stream",
            "name": "stderr" if raw.get("name") == "stderr" else "stdout",
            "text": _clip(ANSI.sub("", _text(raw.get("text")))),
        }
    if kind in ("execute_result", "display_data"):
        data: dict[str, str] = {}
        for mime, value in (raw.get("data") or {}).items():
            if mime in TEXT_MIMES:
                data[mime] = _clip(_text(value))
            elif mime in IMAGE_MIMES:
                text = _text(value)
                if len(text) <= MAX_IMAGE_CHARS:
                    data[mime] = (
                        text.replace("\n", "") if mime != "image/svg+xml" else text
                    )
        return {"type": "display", "data": data} if data else None
    if kind == "error":
        return {
            "type": "error",
            "ename": _text(raw.get("ename")),
            "evalue": _text(raw.get("evalue")),
            "traceback": _clip(
                ANSI.sub(
                    "", "\n".join(_text(line) for line in raw.get("traceback") or [])
                )
            ),
        }
    return None


def notebook_language(notebook: dict) -> str:
    metadata = notebook.get("metadata") or {}
    language = (metadata.get("language_info") or {}).get("name") or (
        metadata.get("kernelspec") or {}
    ).get("language")
    return str(language or "python").lower()


def notebook_cells(notebook: dict) -> list[dict]:
    cells = []
    for index, cell in enumerate(notebook.get("cells") or []):
        if not isinstance(cell, dict):
            continue
        kind = cell.get("cell_type")
        kind = kind if kind in ("code", "markdown") else "raw"
        outputs = (
            [
                output
                for output in (
                    _output(item)
                    for item in cell.get("outputs") or []
                    if isinstance(item, dict)
                )
                if output
            ]
            if kind == "code"
            else []
        )
        cells.append(
            {
                "index": index,
                "id": str(cell.get("id") or f"cell-{index}"),
                "type": kind,
                "source": _text(cell.get("source")),
                "execution_count": cell.get("execution_count")
                if kind == "code"
                else None,
                "outputs": outputs,
            }
        )
    return cells


def output_text(outputs: list[dict], limit: int = 2000) -> str:
    """Textual summary of outputs, for search, chat context and explanations."""
    parts = []
    for output in outputs:
        if output["type"] == "stream":
            parts.append(output["text"])
        elif output["type"] == "error":
            parts.append(f"{output['ename']}: {output['evalue']}")
        else:
            data = output.get("data") or {}
            if "text/plain" in data:
                parts.append(data["text/plain"])
            elif any(mime.startswith("image/") for mime in data):
                parts.append("[figure]")
    return _clip("\n".join(part.strip() for part in parts if part.strip()), limit)


def notebook_text(notebook: dict) -> str:
    """Markdown rendering of a notebook for the source's full text."""
    language = notebook_language(notebook)
    blocks = []
    for cell in notebook_cells(notebook):
        source = cell["source"].strip()
        if cell["type"] == "markdown":
            if source:
                blocks.append(source)
        elif cell["type"] == "code":
            if source:
                blocks.append(f"```{language}\n{source}\n```")
            result = output_text(cell["outputs"])
            if result:
                blocks.append(f"Output:\n\n```text\n{result}\n```")
        elif source:
            blocks.append(source)
    return "\n\n".join(blocks)
