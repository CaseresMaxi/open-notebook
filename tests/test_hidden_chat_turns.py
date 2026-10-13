"""Internal chat turns reach the model but never appear in transcripts."""

from langchain_core.messages import AIMessage

from api.routers._chat_shared import extract_chat_messages
from open_notebook.utils.chat_images import ChatInput, build_user_message
from open_notebook.utils.chat_responses import latest_request


def test_hidden_turn_is_kept_for_the_model_but_not_listed():
    visible = build_user_message("Explícame la auditoría", [])
    offer = AIMessage(
        id="ai-1",
        content="¿Cómo quieres practicar?",
        additional_kwargs={"response_followups": [{"kind": "study"}]},
    )
    hidden = build_user_message(
        "Quiero resolver un test interactivo aquí en el chat", [], hidden=True
    )
    assert hidden.additional_kwargs == {"hidden": True}
    listed = extract_chat_messages([visible, offer, hidden])
    assert [m.content for m in listed] == [
        "Explícame la auditoría",
        "¿Cómo quieres practicar?",
    ]
    # The quiz pipeline still reads the hidden choice as the current request.
    assert "test interactivo en el chat" in latest_request([visible, offer, hidden])


def test_requests_are_visible_by_default():
    assert ChatInput(message="hola").hidden is False
    assert build_user_message("hola", []).additional_kwargs == {}
