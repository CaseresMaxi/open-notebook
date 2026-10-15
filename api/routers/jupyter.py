"""Jupyter notebook sources: cells for the in-app viewer and tutor explanations.

Code never runs on the server: the viewer executes cells in the student's
browser with Pyodide (see ADR-030).
"""

import asyncio
import hashlib
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.routers.sources import _resolve_source_file
from open_notebook.ai.notebook_tutor import explain_cells, explain_output
from open_notebook.exceptions import InvalidInputError, UnsupportedTypeException
from open_notebook.utils.jupyter import (
    NotebookError,
    is_notebook_path,
    load_notebook,
    notebook_cells,
    notebook_language,
)
from open_notebook.workspaces import data_root

router = APIRouter()


class ExplanationsRequest(BaseModel):
    language: Optional[str] = Field(default=None, max_length=32)
    model_id: Optional[str] = Field(default=None, max_length=255)
    refresh: bool = False


class OutputExplanationRequest(BaseModel):
    code: str = Field(..., max_length=20000)
    output: str = Field(default="", max_length=8000)
    context: str = Field(default="", max_length=4000)
    language: Optional[str] = Field(default=None, max_length=32)
    model_id: Optional[str] = Field(default=None, max_length=255)


async def _notebook(source_id: str) -> tuple[dict, str]:
    path, _ = await _resolve_source_file(source_id)
    if not is_notebook_path(path):
        raise UnsupportedTypeException("This source is not a Jupyter notebook")
    raw = await asyncio.to_thread(Path(path).read_bytes)
    try:
        notebook = load_notebook(raw)
    except NotebookError as exc:
        raise InvalidInputError(str(exc)) from exc
    return notebook, hashlib.sha256(raw).hexdigest()


def _cache_path(source_id: str, digest: str, language: Optional[str]) -> Path:
    key = hashlib.sha256(
        f"{source_id}\0{digest}\0{language or ''}".encode()
    ).hexdigest()
    return data_root() / "notebook-explanations" / f"{key}.json"


def _read_cache(path: Path) -> Optional[dict[int, str]]:
    try:
        return {int(k): v for k, v in json.loads(path.read_text()).items()}
    except (OSError, ValueError, AttributeError):
        return None


@router.get("/sources/{source_id}/notebook")
async def get_notebook(source_id: str, language: Optional[str] = None):
    notebook, digest = await _notebook(source_id)
    cached = await asyncio.to_thread(
        _read_cache, _cache_path(source_id, digest, language)
    )
    return {
        "language": notebook_language(notebook),
        "cells": notebook_cells(notebook),
        "explanations": cached or {},
    }


@router.post("/sources/{source_id}/notebook/explanations")
async def notebook_explanations(source_id: str, request: ExplanationsRequest):
    notebook, digest = await _notebook(source_id)
    cache = _cache_path(source_id, digest, request.language)
    if not request.refresh:
        cached = await asyncio.to_thread(_read_cache, cache)
        if cached:
            return {"explanations": cached}
    explanations = await explain_cells(
        notebook_cells(notebook),
        notebook_language(notebook),
        request.language,
        request.model_id,
    )

    def write() -> None:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(explanations, ensure_ascii=False))

    await asyncio.to_thread(write)
    return {"explanations": explanations}


@router.post("/sources/{source_id}/notebook/explain-output")
async def notebook_output_explanation(
    source_id: str, request: OutputExplanationRequest
):
    # Resolving the notebook keeps this scoped to the caller's own sources.
    await _notebook(source_id)
    if not request.code.strip():
        raise InvalidInputError("There is no code to explain")
    explanation = await explain_output(
        request.code,
        request.output,
        request.context,
        request.language,
        request.model_id,
    )
    return {"explanation": explanation}
