"""Read study text aloud with the operator's default text-to-speech model."""

import os

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel, Field

from open_notebook.ai.models import model_manager
from open_notebook.exceptions import ConfigurationError, InvalidInputError
from open_notebook.usage import ametered
from open_notebook.utils.speech_text import speech_chunks, speech_text

router = APIRouter()

# Long answers are spoken in chunks; this bounds cost and response time.
MAX_SPEECH_CHARS = 20000
TUTOR_STYLE = (
    "Speak like a clear, warm tutor reading study notes: natural pace, "
    "brief pauses between ideas, in the language of the text."
)


class SpeechRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=60000)


@router.post("/speech")
async def synthesize_speech(request: SpeechRequest):
    text = speech_text(request.text)
    if not text:
        raise InvalidInputError("There is no readable text")
    text = text[:MAX_SPEECH_CHARS]
    model = await model_manager.get_text_to_speech()
    if model is None:
        raise ConfigurationError(
            "No text-to-speech model is configured. Choose one in Models."
        )
    voice = os.getenv("NEXTNOOTBOOK_TTS_VOICE", "nova")
    options = {}
    # Only gpt-4o TTS models accept style instructions.
    if getattr(model, "provider", "") == "openai" and "gpt-4o" in (
        model.model_name or ""
    ):
        options["instructions"] = TUTOR_STYLE
    audio = bytearray()
    # MP3 frames concatenate into one playable stream.
    async with ametered(model.model_name or "tts", len(text) // 4 + 1, "speech"):
        for chunk in speech_chunks(text):
            result = await model.agenerate_speech(text=chunk, voice=voice, **options)
            audio += result.audio_data
    return Response(
        content=bytes(audio),
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )
