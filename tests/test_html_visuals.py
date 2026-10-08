from unittest.mock import AsyncMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, ValidationError

from open_notebook.domain.exam import Exam
from open_notebook.graphs import exam as exam_graph
from open_notebook.utils.chat_images import (
    ChatInput,
    HtmlVisual,
    message_images,
    visual_history_context,
)
from open_notebook.utils.chat_responses import requested_widgets
from open_notebook.utils.chat_visuals import invoke_visual_chat
from open_notebook.utils.exam_answers import OpenAnswer

HTML = '<style>@keyframes reveal{from{opacity:0}to{opacity:1}}svg{animation:reveal 2s}</style><svg viewBox="0 0 300 120"><text x="10" y="20">Clase A: 3</text><rect x="10" y="30" width="90" height="20"/><text x="10" y="80">Clase B: 2</text><rect x="10" y="90" width="60" height="20"/></svg>'


def visual():
    return HtmlVisual(
        name="Counts", html=HTML, description="Class A has 3 points, class B has 2."
    )


def test_declarative_visual_retains_labels_but_removes_executable_and_navigation_content():
    artifact = HtmlVisual(
        name="Safe",
        description="Two classes",
        html=HTML
        + '<script>parent.document.body.remove();fetch("https://bad.test")</script><meta http-equiv="refresh" content="0;url=https://bad.test"><iframe src="https://bad.test"></iframe><a href="https://bad.test" onclick="alert(1)">label</a><img src="https://bad.test/x">',
    )
    assert "Clase A: 3" in artifact.html
    assert "@keyframes" in artifact.html
    assert "bad.test" not in artifact.html
    assert "<script" not in artifact.html
    assert "onclick" not in artifact.html
    assert "<meta" not in artifact.html
    assert "<iframe" not in artifact.html


def test_html_is_output_only_not_an_upload_or_student_answer():
    cases: list[tuple[type[BaseModel], dict]] = [
        (ChatInput, {"message": "See diagram", "images": [visual().model_dump()]}),
        (OpenAnswer, {"text": "My answer", "images": [visual().model_dump()]}),
    ]
    for model, data in cases:
        with pytest.raises(ValidationError):
            model.model_validate(data)
    with pytest.raises(ValidationError):
        HtmlVisual(name="Huge", description="X", html="<div>" + "x" * 100_000)


@pytest.mark.parametrize(
    "prompt",
    [
        "Genera un diagrama",
        "Muéstrame un gráfico animado",
        "Create an HTML table",
        "Dibuja un árbol como imagen",
    ],
)
def test_requests_enable_visual_tools(prompt):
    assert requested_widgets(prompt)[0]


@pytest.mark.asyncio
async def test_html_tool_saves_positioned_figure_and_reuses_it_in_followup(monkeypatch):
    raster = AsyncMock()
    monkeypatch.setattr("open_notebook.utils.chat_visuals.generate_chat_image", raster)
    model = AsyncMock()
    model.bind_tools = lambda tools: model
    model.ainvoke.side_effect = [
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "render_html_visual",
                    "args": {
                        "html": HTML,
                        "caption": "Counts",
                        "description": "A=3, B=2",
                    },
                    "id": "html1",
                }
            ],
        ),
        AIMessage(content="First\n\n[[image:1]]\n\nAfter"),
    ]
    reply = await invoke_visual_chat(
        model, [HumanMessage(content="Make a graph")], set(), None
    )
    raster.assert_not_awaited()
    assert reply.content == "First\n\n[[image:1]]\n\nAfter"
    figures = message_images(reply)
    assert isinstance(figures[0], HtmlVisual)
    assert "Clase A: 3" in figures[0].html
    assert "data_url" not in reply.additional_kwargs["response_images"][0]
    history = visual_history_context([reply, HumanMessage(content="Explain the graph")])
    assert "Clase A: 3" in history[0].content
    assert reply.content != history[0].content  # checkpoints keep placement text


@pytest.mark.asyncio
async def test_html_pool_survives_database_refresh_and_public_response(monkeypatch):
    from api.routers.exams import _exam_response
    from open_notebook.domain import base

    artifact = visual()
    exam = Exam(
        notebook_id="notebook:test", title="Counts", images={"figure1": artifact}
    )
    monkeypatch.setattr(
        base,
        "repo_create",
        AsyncMock(
            return_value=[
                {"id": "exam:test", "images": {"figure1": artifact.model_dump()}}
            ]
        ),
    )
    await exam.save()
    assert isinstance(exam.images["figure1"], HtmlVisual)
    public = _exam_response(exam, include_questions=True).model_dump()
    assert public["images"]["figure1"]["kind"] == "html"
    assert "Clase A: 3" in public["images"]["figure1"]["html"]


@pytest.mark.asyncio
async def test_exam_generation_and_grading_receive_actual_html_not_image_urls(
    monkeypatch,
):
    model = AsyncMock()
    model.ainvoke.return_value = AIMessage(
        content='{"title":"Counts","questions":[{"type":"open","prompt":"Compare Figure 1","image_ids":["figure1"],"reference_answer":"A has one more point than B"}]}'
    )
    monkeypatch.setattr(
        exam_graph, "provision_langchain_model", AsyncMock(return_value=model)
    )
    images = {"figure1": visual()}
    _, questions = await exam_graph.generate_exam_questions(
        "Counts",
        num_multiple_choice=0,
        num_multiple_select=0,
        num_fill_blank=0,
        num_open=1,
        difficulty="medium",
        language="es",
        instructions=None,
        model_id=None,
        images=images,
    )
    blocks = model.ainvoke.call_args.args[0][-1].content
    assert all(block["type"] == "text" for block in blocks)
    assert "Clase A: 3" in blocks[0]["text"]
    assert questions[0].image_ids == ["figure1"]
    model.ainvoke.return_value = AIMessage(content='{"score":1,"feedback":"Correct"}')
    assert await exam_graph.grade_with_ai(
        questions[0], "A has one more", language="es", model_id=None, images=images
    ) == (1, "Correct")
    assert "Clase B: 2" in model.ainvoke.call_args.args[0][-1].content[0]["text"]


@pytest.mark.asyncio
async def test_tool_requests_css_repair_instead_of_silently_breaking_script_controls():
    model = AsyncMock()
    model.bind_tools = lambda tools: model
    model.ainvoke.side_effect = [
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "render_html_visual",
                    "args": {
                        "html": '<button onclick="pause()">Pause</button><script>function pause(){}</script>'
                        + HTML,
                        "caption": "Counts",
                        "description": "A=3, B=2",
                    },
                    "id": "bad",
                }
            ],
        ),
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "render_html_visual",
                    "args": {
                        "html": '<input id="pause" type="checkbox"><label for="pause">Pause</label><style>#pause:checked~svg{animation-play-state:paused}</style>'
                        + HTML,
                        "caption": "Counts",
                        "description": "A=3, B=2",
                    },
                    "id": "fixed",
                }
            ],
        ),
        AIMessage(content="[[image:1]]"),
    ]
    reply = await invoke_visual_chat(model, [], set(), None)
    error = next(
        message.content
        for message in model.ainvoke.call_args.args[0]
        if getattr(message, "tool_call_id", None) == "bad"
    )
    assert "checkbox/radio" in error
    assert "Tool error" in error
    artifacts = message_images(reply)
    assert len(artifacts) == 1
    assert isinstance(artifacts[0], HtmlVisual)
    assert "animation-play-state:paused" in artifacts[0].html
