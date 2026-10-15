"""Chat focus: sources the notebook chat concentrates on.

The client sends the focused source ids with each turn and, for focused Jupyter
notebooks, what the student has on screen in this browser session: edited
code, the results they got (or the saved ones) and errors, numbered like the
notebook shows them. The context itself still arrives through the normal
context config; this adds the instructions and the live notebook state.
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

MAX_FOCUS_CHARS = 60_000


class LiveCell(BaseModel):
    number: int = Field(0, ge=0, le=10_000)
    kind: Literal["code", "markdown"] = "code"
    code: str = Field("", max_length=8_000)
    edited: bool = False
    from_chat: bool = False
    status: Literal["not_run", "saved", "ran", "error", "running"] = "not_run"
    output: str = Field("", max_length=2_000)


class LiveNotebook(BaseModel):
    source_id: str = Field(..., max_length=200)
    title: str = Field("", max_length=300)
    cells: list[LiveCell] = Field(default_factory=list, max_length=600)


class ChatFocus(BaseModel):
    source_ids: list[str] = Field(default_factory=list, max_length=50)
    notebooks: list[LiveNotebook] = Field(default_factory=list, max_length=4)


_STATUS = {
    "not_run": "not run yet",
    "saved": "not run in this session; output saved in the file",
    "ran": "ran in this session",
    "error": "ran in this session and FAILED",
    "running": "running now",
}


def _cell_text(cell: dict[str, Any]) -> str:
    if cell.get("kind") == "markdown":
        return f"[markdown]\n{cell.get('code', '').strip()}"
    flags = [_STATUS.get(cell.get("status", "not_run"), "not run yet")]
    if cell.get("edited"):
        flags.append("edited by the student")
    if cell.get("from_chat"):
        flags.append("added from this chat")
    text = f"[cell {cell.get('number', 0)} — {', '.join(flags)}]\n```python\n{cell.get('code', '').rstrip()}\n```"
    output = (cell.get("output") or "").strip()
    if output:
        text += f"\nOutput:\n```\n{output}\n```"
    return text


def _notebook_text(notebook: dict[str, Any]) -> str:
    header = f'Jupyter notebook "{notebook.get("title") or "untitled"}" [{notebook.get("source_id")}]'
    return (
        header
        + "\n\n"
        + "\n\n".join(_cell_text(cell) for cell in notebook.get("cells", []))
    )


def focus_instructions(focus: Optional[dict[str, Any]]) -> str:
    """System-prompt section for a focused turn ('' when there is no focus)."""
    if not focus or not focus.get("source_ids"):
        return ""
    ids = ", ".join(f"[{source_id}]" for source_id in focus["source_ids"])
    parts = [
        "\n\n# FOCUS\n",
        f"The user put the chat in focus mode on these sources: {ids}. The context "
        "contains only them. Concentrate your answer on them: explain, quote and "
        "cite them; when something is not in them, say so before using general "
        "knowledge.",
    ]
    notebooks = focus.get("notebooks") or []
    if notebooks:
        parts.append(
            "\n\nOne or more focused sources are Jupyter notebooks the user is "
            "working on in their browser (Python runs there, in Pyodide, with "
            "pandas, numpy, scikit-learn, matplotlib and packages installed from "
            "PyPI on import). Below is what they have on screen right now: their "
            "edits, the results they got and any errors. Variables exist only "
            "from cells that ran in this session.\n"
            "- Refer to cells by their number, as in 'cell 7'.\n"
            "- To explain an error, point to the cell and line and say why it "
            "fails with these results.\n"
            "- When you propose code, write one complete, runnable ```python block "
            "per step that works after the cells that already ran; the user can "
            "add each block to the notebook as a new cell with one click. Keep "
            "plots with matplotlib/seaborn and finish them with plt.show().\n"
            "- Teach: say what to look at in the result and why, without dumping "
            "the whole solution unless they ask for it."
        )
        budget = MAX_FOCUS_CHARS
        for notebook in notebooks:
            text = _notebook_text(notebook)
            if len(text) > budget:
                text = text[:budget] + "\n… (truncated)"
            budget -= len(text)
            parts.append(f"\n\n## LIVE NOTEBOOK\n\n{text}")
            if budget <= 0:
                break
    return "".join(parts)
