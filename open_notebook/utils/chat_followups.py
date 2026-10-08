"""Bounded clarification questions persisted with assistant messages."""

import json
import re
import unicodedata
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from open_notebook.utils.text_utils import extract_text_content

FOLLOWUP_BLOCK = re.compile(r"```chat-followup\s*(.*?)```", re.DOTALL | re.IGNORECASE)


class FollowupOption(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=2000)


class FollowupQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    options: list[FollowupOption] = Field(min_length=2, max_length=4)


def study_mode(request: str) -> str | None:
    text = "".join(
        c
        for c in unicodedata.normalize(
            "NFKD", request.split("Pedido original:", 1)[0].lower()
        )
        if not unicodedata.combining(c)
    )
    if re.search(
        r"\b(independiente|separado|standalone|separate)\b", text
    ) and re.search(r"\b(chat|aqui|aca|here)\b", text):
        return None
    if re.search(r"\b(independiente|separado|standalone|separate)\b", text):
        return "exam"
    return (
        "chat"
        if bool(
            re.search(
                r"\b(chat|aqui|aca|here)\b",
                text,
            )
        )
        else None
    )


def followup_instructions() -> str:
    return (
        "\nCONTINUATION QUESTIONS:\n"
        "If a study/test request does not say whether to use an independent exam or an inline chat test, ask which format the user wants before generating questions. "
        "Respect an explicit chat/standalone choice and do not ask it again. "
        "When another relevant ambiguity prevents a useful answer, ask one brief clarification in the user's language. "
        "You may render 2-4 concrete reply choices using one fenced chat-followup JSON object: "
        '{"question":"How would you like to continue?","options":[{"label":"Short explanation","message":"Give me a short explanation"},{"label":"Worked example","message":"Show me a worked example"}]}. '
        "Options send ordinary user messages; never include executable actions or URLs. "
        "Do not generate a quiz while waiting for clarification. Ordinary free-text replies are also valid. "
        "Do not ask unnecessary questions when the user's preference is already clear."
    )


def materialize_followups(reply: Any, request: str, needs_study_choice: bool) -> Any:
    content = re.sub(r"\[\[followup:\d+\]\]", "", reply.content)
    if needs_study_choice and study_mode(request) != "chat":
        # Never expose questions/answer keys generated before the format was chosen.
        figures = "\n\n".join(re.findall(r"\[\[image:\d+\]\]", content))
        return reply.model_copy(
            update={
                "content": (figures + "\n\n[[followup:1]]").strip(),
                "additional_kwargs": {
                    **reply.additional_kwargs,
                    "response_quizzes": [],
                    "response_followups": [
                        {"kind": "exam" if study_mode(request) == "exam" else "study"}
                    ],
                },
            }
        )
    followups: list[dict[str, Any]] = []

    def replace(match: re.Match[str]) -> str:
        if followups:
            return ""
        try:
            question = FollowupQuestion.model_validate_json(match.group(1))
        except (ValidationError, json.JSONDecodeError):
            return ""
        followups.append({"kind": "question", **question.model_dump()})
        return "[[followup:1]]"

    content = FOLLOWUP_BLOCK.sub(replace, content)
    content = re.sub(
        r"```chat-followup\b.*$", "", content, flags=re.DOTALL | re.IGNORECASE
    )
    return reply.model_copy(
        update={
            "content": content.strip(),
            "additional_kwargs": {
                **reply.additional_kwargs,
                "response_followups": followups,
            },
        }
    )


def followup_context(messages: list[Any]) -> list[Any]:
    """Explain saved widgets to the model so free-text continuations have context."""
    result = []
    for message in messages:
        followups = getattr(message, "additional_kwargs", {}).get(
            "response_followups", []
        )
        content = extract_text_content(message.content)
        for index, followup in enumerate(followups):
            if followup.get("kind") in ("study", "exam"):
                question = "How would you like to continue? 1. Create a separate exam using the exam configuration. 2. Take an interactive test here in the chat. Await the user's choice."
            else:
                question = (
                    followup.get("question", "")
                    + "\n"
                    + "\n".join(
                        option.get("label", "")
                        for option in followup.get("options", [])
                    )
                )
            content = content.replace(f"[[followup:{index + 1}]]", question)
        result.append(
            message.model_copy(update={"content": content}) if followups else message
        )
    return result
