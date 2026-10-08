from unittest.mock import AsyncMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from api.routers._chat_shared import extract_chat_messages
from open_notebook.utils import chat_responses
from open_notebook.utils.chat_followups import followup_context


@pytest.mark.asyncio
async def test_unspecified_exam_waits_and_never_saves_or_leaks_keys(monkeypatch):
    save = AsyncMock()
    monkeypatch.setattr(chat_responses.ChatQuiz, "save", save)
    result = await chat_responses.materialize_chat_response(
        AIMessage(
            id="ai:test",
            content='Answer: secret\n```chat-quiz\n{"correct_option": 0}\n```',
        ),
        "chat_session:test",
        "model:test",
        "Haceme un examen de KNN",
    )
    assert result.content == "[[followup:1]]"
    assert result.additional_kwargs["response_followups"] == [{"kind": "study"}]
    assert extract_chat_messages([result])[0].followups == [{"kind": "study"}]
    save.assert_not_awaited()


@pytest.mark.asyncio
async def test_independent_exam_offers_configuration_instead_of_inline_quiz():
    result = await chat_responses.materialize_chat_response(
        AIMessage(content="Draft questions"),
        "chat_session:test",
        None,
        "Quiero un examen independiente de KNN",
    )
    assert result.additional_kwargs["response_followups"] == [{"kind": "exam"}]
    assert "Draft" not in result.content


@pytest.mark.asyncio
async def test_generic_clarification_waits_before_quiz_generation(monkeypatch):
    repair = AsyncMock()
    monkeypatch.setattr(chat_responses, "repair_inline_quiz", repair)
    result = await chat_responses.materialize_chat_response(
        AIMessage(
            content='```chat-followup\n{"question":"¿Qué tema?","options":[{"label":"KNN","message":"Explicame KNN"},{"label":"Árboles","message":"Explicame árboles"}]}\n```'
        ),
        "chat_session:test",
        None,
        "Quiero estudiar",
    )
    assert result.content == "[[followup:1]]"
    assert result.additional_kwargs["response_followups"][0]["question"] == "¿Qué tema?"
    repair.assert_not_awaited()
    assert "¿Qué tema?" in followup_context([result])[0].content


def test_free_text_choice_preserves_original_request():
    history = [
        HumanMessage(content="Examen de 2 preguntas de KNN"),
        AIMessage(
            content="[[followup:1]]",
            additional_kwargs={"response_followups": [{"kind": "study"}]},
        ),
        HumanMessage(content="la segunda"),
    ]
    request = chat_responses.latest_request(history)
    assert "en el chat" in request
    assert "2 preguntas de KNN" in request
    assert "Create a separate exam" in followup_context(history)[1].content
