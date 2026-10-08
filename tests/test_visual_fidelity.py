import base64
from io import BytesIO
from unittest.mock import AsyncMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from PIL import Image

from open_notebook.domain.notebook import Source
from open_notebook.graphs.visual_review import VisualReview, review_html_visual
from open_notebook.utils.chat_images import ChatImage, HtmlVisual, message_images
from open_notebook.utils.chat_visuals import invoke_visual_chat
from open_notebook.utils.visual_fidelity import VisualPlan

HTML = '<svg viewBox="0 0 300 120"><text x="10" y="20">Refund = Yes?</text><text x="10" y="70">si: (3,0)</text><text x="160" y="70">no: (4,3)</text></svg>'


class ToolModel:
    def __init__(self, replies):
        self.replies = iter(replies)
        self.payloads = []

    def bind_tools(self, tools):
        return self

    async def ainvoke(self, messages):
        self.payloads.append(list(messages))
        return next(self.replies)


def call(name, args, identifier):
    return AIMessage(
        content="", tool_calls=[{"name": name, "args": args, "id": identifier}]
    )


def plan_args(page=8, basis="adaptation", source_id="source:tree", quote=""):
    return dict(
        basis=basis,
        purpose="Explain the first decision-tree split in the user's source",
        references=[
            dict(
                source_id=source_id,
                page=page,
                quote=quote,
                observation="The original figure splits Refund = Yes? into si (3,0) and no (4,3).",
            )
        ],
        preserve=[
            "Refund = Yes? and si/no branch directions",
            "Class counts (3,0) and (4,3)",
        ],
        changes=["Responsive HTML layout; the original values remain unchanged."],
        checks=[
            "Child totals sum to the root's ten cases",
            "si and no retain their original class counts",
        ],
    )


def render_args(plan_id=None, html=HTML):
    return dict(
        html=html,
        caption="First tree split",
        description="The source splits ten cases by Refund = Yes?",
        plan_id=plan_id,
    )


@pytest.fixture
def evidence(monkeypatch):
    source = Source(
        title="Tree.pdf",
        full_text="An original decision tree splits ten cases by Refund = Yes?",
    )
    object.__setattr__(source, "id", "source:tree")
    monkeypatch.setattr(Source, "get", AsyncMock(return_value=source))
    buffer = BytesIO()
    Image.new("RGB", (80, 40), "blue").save(buffer, "PNG")
    preview = ChatImage(
        name="Tree page 8",
        data_url="data:image/png;base64,"
        + base64.b64encode(buffer.getvalue()).decode(),
        kind="source",
        source_id="source:tree",
        source_title="Tree.pdf",
        page=8,
    )
    monkeypatch.setattr(
        "open_notebook.utils.chat_visuals.render_source_image", lambda *args: preview
    )
    reviewer = AsyncMock(return_value=VisualReview(accepted=True))
    monkeypatch.setattr("open_notebook.utils.chat_visuals.review_html_visual", reviewer)
    return source, preview, reviewer


@pytest.mark.asyncio
async def test_no_generic_generated_figure_with_selected_sources(evidence):
    model = ToolModel(
        [
            call("render_html_visual", render_args(), "unreviewed"),
            AIMessage(content="Cannot attach an unreviewed reconstruction."),
        ]
    )
    reply = await invoke_visual_chat(model, [], {"source:tree"}, None)
    assert not message_images(reply)
    assert "inspect" in model.payloads[-1][-1].content.lower()
    evidence[2].assert_not_awaited()


@pytest.mark.asyncio
async def test_preview_and_plan_in_same_turn_does_not_claim_image_was_seen(evidence):
    combined = AIMessage(
        content="",
        tool_calls=[
            {
                "name": "preview_source_page",
                "args": {"source_id": "source:tree", "page": 8},
                "id": "preview",
            },
            {"name": "plan_source_visual", "args": plan_args(), "id": "premature"},
        ],
    )
    model = ToolModel(
        [
            combined,
            call("render_html_visual", render_args("plan1"), "invalid"),
            AIMessage(content="No figure"),
        ]
    )
    reply = await invoke_visual_chat(model, [], {"source:tree"}, None)
    assert not message_images(reply)
    errors = [
        m.content
        for m in model.payloads[-1]
        if isinstance(m, ToolMessage) and "Tool error" in m.content
    ]
    assert any("previous turn" in error for error in errors)
    evidence[2].assert_not_awaited()


@pytest.mark.asyncio
async def test_source_plan_provenance_and_actual_original_pixels_reach_review(evidence):
    model = ToolModel(
        [
            call(
                "preview_source_page",
                {"source_id": "source:tree", "page": 8},
                "preview",
            ),
            call("plan_source_visual", plan_args(), "plan"),
            call("render_html_visual", render_args("plan1"), "render"),
            AIMessage(content="Explanation\n\n[[image:1]]"),
        ]
    )
    reply = await invoke_visual_chat(
        model,
        [HumanMessage(content="Redraw my original tree")],
        {"source:tree"},
        "model:chosen",
    )
    figure = message_images(reply)[0]
    assert isinstance(figure, HtmlVisual)
    assert figure.basis == "adaptation"
    assert figure.references[0].source_title == "Tree.pdf"
    assert figure.references[0].page == 8
    assert "(4,3)" in figure.html
    reviewer = evidence[2]
    assert reviewer.call_args.args[2] == [evidence[1]]
    assert reviewer.call_args.args[3] == "model:chosen"
    assert reviewer.call_args.kwargs["for_exam"] is False
    assert any(
        isinstance(m, HumanMessage)
        and isinstance(m.content, list)
        and any(
            isinstance(b, dict) and "Original source source:tree" in b.get("text", "")
            for b in m.content
        )
        for m in model.payloads[1]
    )


@pytest.mark.asyncio
async def test_semantic_review_rejects_wrong_counts_then_accepts_correction(evidence):
    reviewer = evidence[2]
    reviewer.side_effect = [
        VisualReview(
            accepted=False, issues=["The no branch must retain (4,3), not (3,4)."]
        ),
        VisualReview(accepted=True),
    ]
    model = ToolModel(
        [
            call(
                "preview_source_page",
                {"source_id": "source:tree", "page": 8},
                "preview",
            ),
            call("plan_source_visual", plan_args(), "plan"),
            call(
                "render_html_visual",
                render_args("plan1", HTML.replace("(4,3)", "(3,4)")),
                "wrong",
            ),
            call("render_html_visual", render_args("plan1"), "fixed"),
            AIMessage(content="[[image:1]]"),
        ]
    )
    reply = await invoke_visual_chat(model, [], {"source:tree"}, None, for_exam=True)
    figures = message_images(reply)
    assert len(figures) == 1
    assert isinstance(figures[0], HtmlVisual)
    assert "(4,3)" in figures[0].html
    assert reviewer.await_count == 2
    assert reviewer.call_args.kwargs["for_exam"] is True
    assert any(
        isinstance(m, ToolMessage) and "(3,4)" in m.content and "rejected" in m.content
        for m in model.payloads[-1]
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "basis,quote,accepted",
    [
        ("conceptual", "An original decision tree splits ten cases", True),
        ("conceptual", "Forged quote that was not in the source", False),
        ("adaptation", "An original decision tree splits ten cases", False),
    ],
)
async def test_missing_original_allows_only_verified_text_fallback(
    evidence, basis, quote, accepted
):
    model = ToolModel(
        [
            call("review_source_material", {"source_id": "source:tree"}, "text"),
            call(
                "plan_source_visual",
                plan_args(page=None, basis=basis, quote=quote),
                "plan",
            ),
            call("render_html_visual", render_args("plan1"), "render"),
            AIMessage(content="Done"),
        ]
    )
    reply = await invoke_visual_chat(model, [], {"source:tree"}, None)
    assert bool(message_images(reply)) is accepted
    if accepted:
        assert evidence[2].call_args.args[2] == []
        figure = message_images(reply)[0]
        assert isinstance(figure, HtmlVisual)
        assert figure.references[0].page is None


@pytest.mark.asyncio
async def test_excluded_source_cannot_be_used_as_figure_provenance(evidence):
    model = ToolModel(
        [
            call("plan_source_visual", plan_args(source_id="source:excluded"), "plan"),
            AIMessage(content="No figure"),
        ]
    )
    reply = await invoke_visual_chat(model, [], {"source:tree"}, None)
    assert not message_images(reply)
    get_mock = Source.get
    assert isinstance(get_mock, AsyncMock)
    get_mock.assert_not_awaited()


@pytest.mark.asyncio
async def test_reviewer_gets_source_pixels_and_actual_code_without_tokenizing_base64(
    evidence, monkeypatch
):
    model = AsyncMock()
    model.ainvoke.return_value = AIMessage(
        content='{"accepted":false,"issues":["no branch counts reversed"]}'
    )
    provision = AsyncMock(return_value=model)
    monkeypatch.setattr(
        "open_notebook.graphs.visual_review.provision_langchain_model", provision
    )
    plan = VisualPlan.model_validate(plan_args())
    visual = HtmlVisual(
        name="Split",
        description="Source tree",
        html=HTML,
        basis="adaptation",
        references=plan.references,
    )
    result = await review_html_visual(
        visual, plan, [evidence[1]], "model:chosen", for_exam=True
    )
    assert result.accepted is False
    payload = model.ainvoke.call_args.args[0]
    assert evidence[1].data_url == payload[-1].content[-1]["image_url"]["url"]
    assert visual.html in payload[-1].content[0]["text"]
    assert "EXAM" in payload[0].content
    assert evidence[1].data_url not in provision.call_args.args[0]


def test_inline_quiz_public_messages_hide_private_observations_but_keep_saved_evidence():
    plan = VisualPlan.model_validate(plan_args())
    figure = HtmlVisual(
        name="Split",
        description="Source tree",
        html=HTML,
        basis="adaptation",
        references=plan.references,
        fidelity_notes=["A review-only note"],
    )
    reply = AIMessage(
        content="[[quiz:chat_quiz:test]]",
        additional_kwargs={
            "response_images": [figure.model_dump()],
            "response_quizzes": ["chat_quiz:test"],
        },
    )
    private = message_images(reply)[0]
    public = message_images(reply, public=True)[0]
    assert isinstance(private, HtmlVisual) and isinstance(public, HtmlVisual)
    assert private.references
    assert public.references == []
    assert public.fidelity_notes == []
    assert public.html == private.html


@pytest.mark.asyncio
async def test_retained_original_cannot_be_bypassed_with_text_only_citation(
    evidence, monkeypatch
):
    from pathlib import Path

    monkeypatch.setattr(
        "open_notebook.utils.chat_visuals.source_file",
        lambda source: Path("/retained/tree.pdf"),
    )
    model = ToolModel(
        [
            call("review_source_material", {"source_id": "source:tree"}, "text"),
            call(
                "plan_source_visual",
                plan_args(
                    page=None,
                    basis="conceptual",
                    quote="An original decision tree splits ten cases",
                ),
                "bypass",
            ),
            call("render_html_visual", render_args("plan1"), "render"),
            AIMessage(content="No figure without inspecting the original"),
        ]
    )
    reply = await invoke_visual_chat(model, [], {"source:tree"}, None)
    assert not message_images(reply)
    assert any(
        isinstance(m, ToolMessage) and "retained PDFs/images" in m.content
        for m in model.payloads[-1]
    )
    evidence[2].assert_not_awaited()
