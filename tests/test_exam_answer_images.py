import base64
from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from langchain_core.messages import AIMessage
from PIL import Image

from api import exam_service
from open_notebook.domain.exam import Exam, ExamAttempt, ExamQuestion
from open_notebook.exceptions import InvalidInputError
from open_notebook.graphs import exam as graph
from open_notebook.utils.chat_images import ChatImage


@pytest.fixture
def image():
    buffer = BytesIO()
    Image.new("RGB", (40, 40), "blue").save(buffer, "PNG")
    return ChatImage(
        name="answer.png",
        data_url="data:image/png;base64,"
        + base64.b64encode(buffer.getvalue()).decode(),
    )


def question():
    return ExamQuestion(
        id="q1",
        type="open",
        prompt="Describe the diagram",
        reference_answer="Blue",
        points=2,
    )


@pytest.mark.asyncio
async def test_image_only_answer_is_graded_and_persisted(image, monkeypatch):
    exam = Exam(
        id="exam:test",
        notebook_id="notebook:test",
        title="Visual",
        questions=[question().model_dump()],
    )
    grade = AsyncMock(return_value=(2, "Correct diagram"))
    monkeypatch.setattr(exam_service, "grade_with_ai", grade)
    monkeypatch.setattr(ExamAttempt, "save", AsyncMock())
    result = await exam_service.grade_attempt(
        exam, {"q1": {"text": "", "images": [image.model_dump()]}}
    )
    assert result.score == 2
    assert grade.call_args.args[1] == ""
    assert grade.call_args.kwargs["answer_images"][0].data_url == image.data_url
    assert result.answers["q1"]["images"][0]["data_url"] == image.data_url
    assert result.results[0]["graded_by"] == "ai"


@pytest.mark.asyncio
async def test_invalid_images_fail_before_any_model_call(monkeypatch):
    exam = Exam(
        id="exam:test",
        notebook_id="notebook:test",
        title="Visual",
        questions=[question().model_dump()],
    )
    grade = AsyncMock()
    monkeypatch.setattr(exam_service, "grade_with_ai", grade)
    with pytest.raises(InvalidInputError):
        await exam_service.grade_attempt(
            exam,
            {
                "q1": {
                    "text": "Answer",
                    "images": [
                        {"name": "fake.png", "data_url": "https://invalid/image.png"}
                    ],
                }
            },
        )
    grade.assert_not_awaited()


@pytest.mark.asyncio
async def test_grader_receives_question_and_answer_pixels_separately(
    image, monkeypatch
):
    q = question().model_copy(update={"image_ids": ["figure1"]})
    model = AsyncMock()
    model.ainvoke.return_value = AIMessage(content='{"score":2,"feedback":"Correct"}')
    provision = AsyncMock(return_value=model)
    monkeypatch.setattr(graph, "provision_langchain_model", provision)
    await graph.grade_with_ai(
        q,
        "My drawing",
        model_id=None,
        language="es",
        images={"figure1": image},
        answer_images=[image],
    )
    payload = model.ainvoke.call_args.args[0]
    assert "My drawing" in payload[0].content
    assert "STUDENT ANSWER IMAGES" in payload[0].content
    assert payload[1].content[1]["image_url"]["url"] == image.data_url
    assert payload[2].content[-1]["image_url"]["url"] == image.data_url
    assert "Student-submitted answer" in payload[2].content[0]["text"]
    assert image.data_url not in provision.call_args.args[0]
