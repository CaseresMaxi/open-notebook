"""Validate multimodal open answers before any grading calls."""

from pydantic import BaseModel, Field, ValidationError

from open_notebook.exceptions import InvalidInputError
from open_notebook.utils.chat_images import MAX_CHAT_IMAGES, ChatImage


class OpenAnswer(BaseModel):
    text: str = Field(default="", max_length=50_000)
    images: list[ChatImage] = Field(default_factory=list, max_length=MAX_CHAT_IMAGES)


def open_answer(value: object) -> OpenAnswer:
    try:
        answer = OpenAnswer.model_validate(
            value if isinstance(value, dict) else {"text": str(value or "")}
        )
        # Student attachments are answers, not source evidence or generated figures.
        answer.images = [
            ChatImage(name=image.name, data_url=image.data_url)
            for image in answer.images
        ]
        return answer
    except ValidationError as exc:
        raise InvalidInputError(
            "Open answers accept text and up to four valid PNG, JPEG or WebP images, 5 MB each."
        ) from exc
