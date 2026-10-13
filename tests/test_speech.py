"""Read-aloud: Markdown is spoken as prose, long text is chunked, audio is joined."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from api.routers import speech
from open_notebook.exceptions import ConfigurationError, InvalidInputError
from open_notebook.utils.speech_text import speech_chunks, speech_text


def test_markdown_reads_as_prose():
    text = speech_text(
        "<!-- open-notebook:study-summary:v1 -->\n\n"
        "## Naive Bayes\n\n"
        "- **Supuesto** de *independencia* [source:abc]\n"
        "- Ver [la fuente](/sources/x)\n\n"
        "```python\nprint('no')\n```\n\n"
        "| a | b |\n|---|---|\n| 1 | 2 |\n\n"
        "![img](data:x) [[image:1]] `P(A|B)` final!"
    )
    assert "Naive Bayes." in text
    assert "Supuesto de independencia" in text
    assert "la fuente" in text and "/sources" not in text
    for noise in ("**", "##", "print", "source:abc", "[[", "<!--", "data:x", "---"):
        assert noise not in text
    assert text.endswith("final!")


def test_long_text_is_chunked_at_sentences_under_limit():
    sentence = "Esta es una oración de prueba bastante larga. "
    chunks = speech_chunks((sentence * 200).strip(), limit=500)
    assert len(chunks) > 1
    assert all(len(c) <= 500 for c in chunks)
    assert all(c.endswith(".") for c in chunks)
    assert speech_chunks("x" * 1200, limit=500) == ["x" * 500, "x" * 500, "x" * 200]


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(speech.router, prefix="/api")

    from fastapi.responses import JSONResponse

    @app.exception_handler(ConfigurationError)
    async def configuration(_, error):
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @app.exception_handler(InvalidInputError)
    async def invalid(_, error):
        return JSONResponse(status_code=400, content={"detail": str(error)})

    return app


@pytest.mark.asyncio
async def test_speech_joins_chunk_audio_with_tutor_style(app, monkeypatch):
    calls = []

    async def generate(text, voice, **options):
        calls.append((text, voice, options))
        return SimpleNamespace(audio_data=f"<{len(calls)}>".encode())

    model = SimpleNamespace(
        provider="openai", model_name="gpt-4o-mini-tts", agenerate_speech=generate
    )
    monkeypatch.setattr(
        speech.model_manager, "get_text_to_speech", AsyncMock(return_value=model)
    )
    monkeypatch.setattr(speech, "speech_chunks", lambda text: ["uno.", "dos."])
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        response = await c.post("/api/speech", json={"text": "**uno.** dos."})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.content == b"<1><2>"
    assert calls[0][1] == "nova" and "instructions" in calls[0][2]


@pytest.mark.asyncio
async def test_speech_requires_a_configured_model(app, monkeypatch):
    monkeypatch.setattr(
        speech.model_manager, "get_text_to_speech", AsyncMock(return_value=None)
    )
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        response = await c.post("/api/speech", json={"text": "hola"})
        assert response.status_code == 422
        empty = await c.post("/api/speech", json={"text": "```code```"})
    assert empty.status_code == 400
