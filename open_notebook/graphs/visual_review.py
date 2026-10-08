"""Check a generated visual against inspected original source pixels."""

from ai_prompter import Prompter
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field

from open_notebook.ai.provision import provision_langchain_model
from open_notebook.exceptions import OpenNotebookError
from open_notebook.utils import clean_thinking_content
from open_notebook.utils.chat_images import ChatImage, HtmlVisual, chat_model_context
from open_notebook.utils.error_classifier import classify_error
from open_notebook.utils.text_utils import extract_text_content
from open_notebook.utils.visual_fidelity import VisualPlan


class VisualReview(BaseModel):
    accepted: bool
    issues: list[str] = Field(default_factory=list, max_length=6)


async def review_html_visual(
    visual: HtmlVisual,
    plan: VisualPlan,
    previews: list[ChatImage],
    model_id: str | None,
    *,
    for_exam: bool,
    user_request: str = "",
) -> VisualReview:
    try:
        parser: PydanticOutputParser[VisualReview] = PydanticOutputParser(
            pydantic_object=VisualReview
        )
        prompt = Prompter(prompt_template="visuals/review", parser=parser).render(  # type: ignore[arg-type]
            data={"for_exam": for_exam}
        )
        blocks: list[str | dict] = [
            {
                "type": "text",
                "text": f"Actual user request: {user_request[:6000]}\nVisual brief: {plan.model_dump_json()}\nGenerated visual description: {visual.description}\nActual HTML/CSS/SVG to check:\n{visual.html}",
            }
        ]
        for preview in previews:
            blocks.extend(
                [
                    {
                        "type": "text",
                        "text": f"Original source {preview.source_id}, {preview.source_title}, page {preview.page}. Compare this page's actual representation with the generated code.",
                    },
                    {"type": "image_url", "image_url": {"url": preview.data_url}},
                ]
            )
        payload = [SystemMessage(content=prompt), HumanMessage(content=blocks)]
        model = await provision_langchain_model(
            chat_model_context(payload),
            model_id,
            "chat",
            max_tokens=4096,
            structured=dict(type="json"),
        )
        result = await model.ainvoke(payload)
        return parser.parse(
            clean_thinking_content(extract_text_content(result.content))
        )
    except OpenNotebookError:
        raise
    except Exception as exc:
        error_class, user_message = classify_error(exc)
        raise error_class(user_message) from exc
