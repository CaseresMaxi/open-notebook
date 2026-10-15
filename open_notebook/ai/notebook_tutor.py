"""Tutor explanations shown beside the cells of a Jupyter notebook."""

import asyncio
from typing import Optional

from ai_prompter import Prompter
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

from open_notebook.ai.provision import provision_langchain_model
from open_notebook.exceptions import OpenNotebookError
from open_notebook.utils import clean_thinking_content
from open_notebook.utils.error_classifier import classify_error
from open_notebook.utils.jupyter import output_text
from open_notebook.utils.text_utils import extract_text_content

# Serialized cells per model call; longer notebooks are explained in parallel parts.
CHUNK_CHARS = 14_000
MAX_EXPLANATION_CHARS = 2_000


class CellExplanation(BaseModel):
    index: int = Field(description="The cell number N from [[cell N · code]]")
    explanation: str = Field(description="Markdown explanation for the student")


class CellExplanations(BaseModel):
    cells: list[CellExplanation]


def _serialize(cell: dict, language: str) -> str:
    if cell["type"] != "code":
        return f"[[cell {cell['index']} · markdown]]\n{cell['source'].strip()[:4000]}"
    text = f"[[cell {cell['index']} · code]]\n```{language}\n{cell['source'].strip()[:6000]}\n```"
    result = output_text(cell["outputs"], 1200)
    return text + (f"\nSaved output:\n```text\n{result}\n```" if result else "")


def _chunks(cells: list[dict], language: str) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for cell in cells:
        block = _serialize(cell, language)
        if current and size + len(block) > CHUNK_CHARS:
            chunks.append("\n\n".join(current))
            current, size = [], 0
        current.append(block)
        size += len(block)
    if current:
        chunks.append("\n\n".join(current))
    # A part without code cells needs no call.
    return [chunk for chunk in chunks if "· code]]" in chunk]


async def _explain_chunk(
    chunk: str, language: Optional[str], model_id: Optional[str]
) -> list[CellExplanation]:
    parser: PydanticOutputParser[CellExplanations] = PydanticOutputParser(
        pydantic_object=CellExplanations
    )
    system = Prompter(prompt_template="notebook/explain_cells", parser=parser).render(  # type: ignore[arg-type]
        data={"language": language}
    )
    payload = [SystemMessage(content=system), HumanMessage(content=chunk)]
    model = await provision_langchain_model(
        system + chunk, model_id, "transformation", max_tokens=12000
    )
    reply = await model.ainvoke(payload)
    text = clean_thinking_content(extract_text_content(reply.content))
    return parser.parse(text).cells


async def explain_cells(
    cells: list[dict],
    notebook_language: str,
    language: Optional[str] = None,
    model_id: Optional[str] = None,
) -> dict[int, str]:
    """One explanation per code cell, keyed by cell index."""
    code_cells = {cell["index"] for cell in cells if cell["type"] == "code"}
    try:
        parts = await asyncio.gather(
            *(
                _explain_chunk(chunk, language, model_id)
                for chunk in _chunks(cells, notebook_language)
            )
        )
    except OpenNotebookError:
        raise
    except Exception as exc:
        error_class, message = classify_error(exc)
        raise error_class(message) from exc
    return {
        item.index: item.explanation.strip()[:MAX_EXPLANATION_CHARS]
        for part in parts
        for item in part
        if item.index in code_cells and item.explanation.strip()
    }


async def explain_output(
    code: str,
    output: str,
    context: str = "",
    language: Optional[str] = None,
    model_id: Optional[str] = None,
) -> str:
    """Explain the result the student just got from running one cell."""
    system = Prompter(prompt_template="notebook/explain_output").render(
        data={"language": language}
    )
    human = (
        (f"Notebook context (preceding Markdown):\n{context}\n\n" if context else "")
        + f"Cell code:\n```python\n{code}\n```\n\nResult of this run:\n```text\n{output or '(no output)'}\n```"
    )
    payload = [SystemMessage(content=system), HumanMessage(content=human)]
    try:
        model = await provision_langchain_model(
            system + human, model_id, "transformation", max_tokens=2000
        )
        reply = await model.ainvoke(payload)
    except OpenNotebookError:
        raise
    except Exception as exc:
        error_class, message = classify_error(exc)
        raise error_class(message) from exc
    return clean_thinking_content(extract_text_content(reply.content)).strip()[
        :MAX_EXPLANATION_CHARS
    ]
