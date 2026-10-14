"""Inline Arc UI components in chat answers.

The model writes a fenced ```arc block holding one small JSON object; the
frontend renders it with the matching free Arc component (charts, tables,
metrics, steps...). Blocks are validated here before an answer is saved, so
a malformed block never reaches the transcript as raw JSON.
"""

import json
import re
from typing import Annotated, Literal, Union

from loguru import logger
from pydantic import (
    BaseModel,
    Field,
    TypeAdapter,
    ValidationError,
    field_validator,
    model_validator,
)

ARC_BLOCK = re.compile(
    r"```arc[ \t]*\r?\n(.*?)```(?![a-zA-Z-])", re.DOTALL | re.IGNORECASE
)
ARC_TAIL = re.compile(r"```arc[ \t]*\r?\n(?:(?!```).)*$", re.DOTALL | re.IGNORECASE)

Text = Annotated[str, Field(min_length=1, max_length=200)]
Number = Annotated[float, Field(allow_inf_nan=False)]


class _Block(BaseModel):
    title: str = Field(default="", max_length=200)


class Point(BaseModel):
    label: Text
    value: Number


class Series(BaseModel):
    name: Text
    values: list[Number] = Field(min_length=1, max_length=400)


class LineBlock(_Block):
    type: Literal["line"]
    unit: str = Field(default="", max_length=24)
    x: list[Text] = Field(min_length=2, max_length=400)
    series: list[Series] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def same_length(self) -> "LineBlock":
        if any(len(series.values) != len(self.x) for series in self.series):
            raise ValueError("every series needs one value per x label")
        return self


class BarBlock(_Block):
    type: Literal["bar"]
    unit: str = Field(default="", max_length=24)
    period: str = Field(default="", max_length=120)
    items: list[Point] = Field(min_length=1, max_length=40)


class ShareBlock(_Block):
    type: Literal["donut", "waffle"]
    unit: str = Field(default="", max_length=24)
    items: list[Point] = Field(min_length=2, max_length=12)


class TableBlock(_Block):
    type: Literal["table"]
    columns: list[Text] = Field(min_length=1, max_length=8)
    rows: list[list[Union[str, float, None]]] = Field(min_length=1, max_length=60)

    @model_validator(mode="after")
    def rectangular(self) -> "TableBlock":
        if any(len(row) != len(self.columns) for row in self.rows):
            raise ValueError("every row needs one cell per column")
        return self


class Metric(BaseModel):
    label: Text
    value: Number
    suffix: str = Field(default="", max_length=12)
    context: str = Field(default="", max_length=120)
    change: str = Field(default="", max_length=24)


class MetricsBlock(_Block):
    type: Literal["metrics"]
    items: list[Metric] = Field(min_length=1, max_length=6)


class GaugeBlock(_Block):
    type: Literal["gauge"]
    value: Number
    min: Number = 0
    max: Number = 100
    detail: str = Field(default="", max_length=120)

    @model_validator(mode="after")
    def in_range(self) -> "GaugeBlock":
        if not self.min < self.max:
            raise ValueError("min must be below max")
        return self


class Step(BaseModel):
    label: Text
    description: str = Field(default="", max_length=600)

    @field_validator("label")
    @classmethod
    def drop_numbering(cls, value: str) -> str:
        # The stepper numbers its markers; "1. Elegir K" would read "1 1. Elegir K".
        return re.sub(r"^\s*(?:\d+|[a-zA-Z])[.)]\s+", "", value) or value


class StepsBlock(_Block):
    type: Literal["steps"]
    items: list[Step] = Field(min_length=2, max_length=12)


class Section(BaseModel):
    title: Text
    content: str = Field(min_length=1, max_length=4000)


class AccordionBlock(_Block):
    type: Literal["accordion"]
    items: list[Section] = Field(min_length=1, max_length=12)


class CalloutBlock(_Block):
    type: Literal["callout"]
    tone: Literal["info", "success", "warning", "danger"] = "info"
    title: str = Field(min_length=1, max_length=200)
    text: str = Field(default="", max_length=1200)


ArcBlock = Annotated[
    Union[
        LineBlock,
        BarBlock,
        ShareBlock,
        TableBlock,
        MetricsBlock,
        GaugeBlock,
        StepsBlock,
        AccordionBlock,
        CalloutBlock,
    ],
    Field(discriminator="type"),
]
arc_adapter: TypeAdapter[ArcBlock] = TypeAdapter(ArcBlock)
MAX_BLOCKS = 4


def arc_instructions() -> str:
    return (
        "\n\nINTERACTIVE COMPONENTS IN RESPONSES:\n"
        "You can place animated interface components inside your answer. Write a fenced code block "
        "with language arc containing ONE JSON object, on its own lines, exactly where it belongs "
        "in the explanation. Use them organically, only when they make the material clearer than prose "
        "(numbers, comparisons, processes, key figures, collapsible detail); most conversational answers "
        "need none. At most 4 per answer, never two in a row without text, and always explain in prose "
        "what the reader should notice. Data must come from the context or the conversation; never invent "
        "figures. Use the user's language for every label. No citations, Markdown or HTML inside the JSON; "
        "cite in the surrounding text. Available types:\n"
        '- line (trends over an ordered axis): {"type":"line","title":"...","unit":"%","x":["2020","2021"],'
        '"series":[{"name":"...","values":[1.2,3.4]}]} (1-4 series, one value per x)\n'
        '- bar (one measure across categories): {"type":"bar","title":"...","unit":"","period":"...",'
        '"items":[{"label":"...","value":3}]}\n'
        '- donut or waffle (parts of a whole; waffle for percentages): {"type":"donut","title":"...",'
        '"unit":"","items":[{"label":"...","value":40},{"label":"...","value":60}]}\n'
        "- table (several items compared on the same attributes; prefer it to Markdown tables when "
        'sorting helps): {"type":"table","title":"...","columns":["...","..."],"rows":[["...",1]]}\n'
        '- metrics (1-6 headline numbers): {"type":"metrics","items":[{"label":"...","value":98.5,'
        '"suffix":"%","context":"...","change":"+2%"}]}\n'
        '- gauge (one value against a range): {"type":"gauge","title":"...","value":72,"min":0,"max":100,'
        '"detail":"..."}\n'
        '- steps (ordered process, method or chronology; labels without numbers): {"type":"steps",'
        '"title":"...","items":[{"label":"...","description":"..."}]}\n'
        "- accordion (optional detail such as worked examples or proofs; content may use Markdown): "
        '{"type":"accordion","items":[{"title":"...","content":"..."}]}\n'
        '- callout (a warning, key takeaway or common mistake): {"type":"callout","tone":"info|success|'
        'warning|danger","title":"...","text":"..."}\n'
        "Whenever you would otherwise write a Markdown table, a list of numbers to compare, or a numbered "
        "procedure, use the matching arc block instead. Prefer arc blocks over generated HTML visuals for "
        "these standard shapes: they render instantly."
    )


def _drop_reason(raw: str) -> str | None:
    try:
        arc_adapter.validate_python(json.loads(raw))
    except (json.JSONDecodeError, ValidationError) as exc:
        return type(exc).__name__
    return None


def materialize_arc_blocks(content: str) -> str:
    """Keep valid blocks, normalised to compact JSON; drop broken ones."""
    kept = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal kept
        raw = match.group(1).strip()
        reason = _drop_reason(raw)
        if reason or kept >= MAX_BLOCKS:
            logger.warning(f"Dropping arc block ({reason or 'limit reached'})")
            return ""
        kept += 1
        block = arc_adapter.validate_python(json.loads(raw))
        normalised = json.dumps(
            block.model_dump(exclude_defaults=True) | {"type": block.type},
            ensure_ascii=False,
        )
        return f"```arc\n{normalised}\n```"

    content = ARC_BLOCK.sub(replace, content)
    # A truncated block would surface as raw JSON: remove it.
    content = ARC_TAIL.sub("", content)
    return re.sub(r"\n{3,}", "\n\n", content).strip()
