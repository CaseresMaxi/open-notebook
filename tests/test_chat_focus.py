import pytest
from pydantic import ValidationError

from api.routers.chat import ExecuteChatRequest
from open_notebook.utils.chat_focus import ChatFocus, focus_instructions


def test_no_focus_adds_nothing():
    assert focus_instructions(None) == ""
    assert focus_instructions({"source_ids": [], "notebooks": []}) == ""


def test_focus_names_the_sources():
    text = focus_instructions({"source_ids": ["source:a", "source:b"], "notebooks": []})
    assert "[source:a], [source:b]" in text
    assert "LIVE NOTEBOOK" not in text


def test_live_notebook_shows_edits_results_and_errors():
    focus = ChatFocus.model_validate(
        {
            "source_ids": ["source:nb"],
            "notebooks": [
                {
                    "source_id": "source:nb",
                    "title": "KNN",
                    "cells": [
                        {"kind": "markdown", "code": "## Exploración"},
                        {"number": 1, "code": "import pandas as pd", "status": "ran"},
                        {
                            "number": 2,
                            "code": "df.head(",
                            "edited": True,
                            "status": "error",
                            "output": "SyntaxError: '(' was never closed",
                        },
                        {"number": 3, "code": "df.describe()", "from_chat": True},
                    ],
                }
            ],
        }
    )
    text = focus_instructions(focus.model_dump())
    assert 'Jupyter notebook "KNN" [source:nb]' in text
    assert "[cell 2 — ran in this session and FAILED, edited by the student]" in text
    assert "SyntaxError: '(' was never closed" in text
    assert "[cell 3 — not run yet, added from this chat]" in text
    assert "## Exploración" in text
    assert "```python" in text


def test_live_notebook_is_capped():
    cells = [{"number": n, "code": "x" * 7000, "status": "ran"} for n in range(1, 30)]
    text = focus_instructions(
        {
            "source_ids": ["source:nb"],
            "notebooks": [{"source_id": "source:nb", "cells": cells}],
        }
    )
    assert len(text) < 70_000
    assert "(truncated)" in text


def test_request_rejects_oversized_focus():
    with pytest.raises(ValidationError):
        ExecuteChatRequest(
            session_id="chat_session:1",
            message="hola",
            context={},
            focus={"source_ids": [f"source:{n}" for n in range(60)]},
        )
    request = ExecuteChatRequest(
        session_id="chat_session:1",
        message="hola",
        context={},
        focus={"source_ids": ["source:1"]},
    )
    assert request.focus is not None and request.focus.notebooks == []
