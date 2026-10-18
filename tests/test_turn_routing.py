import json
from dataclasses import replace
from typing import Any

import pytest

from open_notebook.ai import decisions
from open_notebook.ai.decisions import TurnDecision, apply_effort, parse_answers
from open_notebook.utils.arc_blocks import arc_instructions, materialize_arc_blocks
from open_notebook.utils.chat_routing import use_visual_tools

ANSWERS: list[dict] = [
    {"type": "predicate", "name": "visual_tools", "probability": 0.1},
    {"type": "choice", "name": "presentation", "choice": "chart", "confidence": 0.6},
    {"type": "score", "name": "effort", "score": 0.2},
]


def decision(**changes) -> TurnDecision:
    return replace(TurnDecision(False, "prose", 0.0, "low", 1), **changes)


def parsed(answers: list, latency_ms: int = 1) -> TurnDecision:
    result = parse_answers(answers, latency_ms)
    assert result is not None
    return result


def test_parses_decisions_answers():
    result = parsed(ANSWERS, 120)
    assert result == TurnDecision(False, "chart", 0.6, "none", 120)
    assert "chart" in result.presentation_hint()


@pytest.mark.parametrize(
    ("score", "effort"), [(0.0, "none"), (0.9, "low"), (1.5, "low"), (2.0, "medium")]
)
def test_effort_levels(score, effort):
    answers = [*ANSWERS[:2], {"type": "score", "name": "effort", "score": score}]
    assert parsed(answers).effort == effort


def test_refusals_fall_back_to_heuristics():
    answers = [{"type": "refusal", "name": "visual_tools"}, *ANSWERS[1:]]
    assert parse_answers(answers, 1) is None
    answers = [ANSWERS[0], {"type": "refusal", "name": "presentation"}, ANSWERS[2]]
    assert parsed(answers).presentation_hint() == ""


def test_charts_skip_the_visual_tool_loop_when_decided():
    request = "Hazme un gráfico de la inflación"
    assert use_visual_tools(None, True, request)
    assert use_visual_tools(None, False, request)
    assert not use_visual_tools(decision(), True, request)
    assert use_visual_tools(decision(visual_tools=True), True, request)
    assert not use_visual_tools(decision(visual_tools=True), False, "Explicame KNN")


@pytest.mark.asyncio
async def test_without_openai_no_decision(monkeypatch):
    async def no_access():
        return None

    monkeypatch.setattr(decisions, "decisions_access", no_access)
    assert await decisions.decide_turn("hola") is None


@pytest.mark.asyncio
async def test_api_failure_never_breaks_a_turn(monkeypatch):
    async def access():
        return "key", "http://127.0.0.1:9"

    assert await decisions.decide_turn("hola", access=await access()) is None


def test_effort_only_changes_gpt6_openai_models():
    from langchain_openai import ChatOpenAI

    gpt6 = ChatOpenAI(model="gpt-6-luna", api_key="x")
    assert apply_effort(gpt6, "none").reasoning_effort == "none"
    other = ChatOpenAI(model="gpt-4.1", api_key="x")
    assert apply_effort(other, "none") is other
    assert apply_effort(object(), "none") is not None


def test_valid_arc_blocks_are_kept_and_normalised():
    block = {"type": "bar", "title": "Notas", "items": [{"label": "A", "value": 3}]}
    content = f"Intro\n\n```arc\n{json.dumps(block)}\n```\n\nCierre"
    result = materialize_arc_blocks(content)
    assert result.startswith("Intro\n\n```arc\n")
    raw = result.split("```arc\n")[1].split("\n```")[0]
    assert json.loads(raw) == {
        "type": "bar",
        "title": "Notas",
        "items": [{"label": "A", "value": 3.0}],
    }


@pytest.mark.parametrize(
    "raw",
    [
        "{not json",
        '{"type":"video","items":[]}',
        '{"type":"line","x":["a","b"],"series":[{"name":"s","values":[1]}]}',
        '{"type":"table","columns":["a","b"],"rows":[["only one"]]}',
        '{"type":"gauge","value":1,"min":5,"max":2}',
    ],
)
def test_broken_arc_blocks_never_reach_the_transcript(raw):
    result = materialize_arc_blocks(f"Antes\n\n```arc\n{raw}\n```\n\nDespués")
    assert result == "Antes\n\nDespués"


def test_truncated_arc_block_is_removed():
    assert materialize_arc_blocks('Texto\n\n```arc\n{"type":"bar","items":[') == "Texto"


def test_at_most_four_blocks():
    block = '```arc\n{"type":"callout","title":"Ojo"}\n```'
    result = materialize_arc_blocks("\n\ntexto\n\n".join([block] * 6))
    assert result.count("```arc") == 4


def test_instructions_document_every_type():
    text = arc_instructions()
    for kind in (
        "line",
        "bar",
        "donut",
        "waffle",
        "table",
        "metrics",
        "gauge",
        "steps",
        "accordion",
        "callout",
        "concept_map",
    ):
        assert kind in text


CONCEPT_MAP: dict[str, Any] = {
    "type": "concept_map",
    "title": "Fotosíntesis",
    "nodes": [
        {"id": "f", "label": "Fotosíntesis", "weight": 5, "group": "Proceso"},
        {"id": "l", "label": "Luz", "detail": "Fuente de energía.", "weight": 3},
        {"id": "g", "label": "Glucosa", "weight": 4, "group": "Producto"},
    ],
    "links": [
        {"source": "l", "target": "f", "label": "impulsa"},
        {"source": "f", "target": "g", "label": "produce"},
        {"source": "f", "target": "g", "label": "repetido"},
        {"source": "g", "target": "g", "label": "bucle"},
    ],
}


def test_concept_map_keeps_concepts_and_drops_noisy_links():
    result = materialize_arc_blocks(f"```arc\n{json.dumps(CONCEPT_MAP)}\n```")
    block = json.loads(result.split("```arc\n")[1].split("\n```")[0])
    assert block["type"] == "concept_map"
    assert [node["id"] for node in block["nodes"]] == ["f", "l", "g"]
    assert "weight" not in block["nodes"][1]  # the default relevance is implied
    assert [(link["source"], link["target"]) for link in block["links"]] == [
        ("l", "f"),
        ("f", "g"),
    ]


@pytest.mark.parametrize(
    "change",
    [
        {
            "links": [
                {"source": "f", "target": "missing"},
                {"source": "l", "target": "f"},
            ]
        },
        {"nodes": CONCEPT_MAP["nodes"] + [{"id": "f", "label": "Otra"}]},
        {"nodes": CONCEPT_MAP["nodes"][:2]},
        {"links": [{"source": "f", "target": "g"}, {"source": "f", "target": "g"}]},
    ],
)
def test_broken_concept_maps_are_dropped(change):
    raw = json.dumps(CONCEPT_MAP | change)
    assert materialize_arc_blocks(f"Intro\n\n```arc\n{raw}\n```") == "Intro"


def test_concept_map_decision_hints_the_block_without_tools():
    turn = decision(presentation="concept_map", presentation_confidence=0.8)
    assert "concept_map arc block" in turn.presentation_hint()
    assert not use_visual_tools(turn, True, "Hazme un repaso del tema")


class FakeModel:
    def __init__(self, delay: float = 0.0):
        self.delay = delay
        self.calls = 0
        self.cancelled = False
        self.reply = None

    async def ainvoke(self, payload):
        import asyncio

        from langchain_core.messages import AIMessage

        self.calls += 1
        try:
            await asyncio.sleep(self.delay)
        except asyncio.CancelledError:
            self.cancelled = True
            raise
        return AIMessage(content="fast answer")


async def _run(monkeypatch, *, access, decision, toggle=True, delay=0.0):
    from langchain_core.messages import AIMessage, HumanMessage

    from open_notebook.utils import chat_routing

    async def fake_access():
        return access

    async def fake_decide(*args, **kwargs):
        return decision

    tool_payloads = []

    async def fake_tools(model, payload, source_ids, model_id, wants_test=None):
        tool_payloads.append(payload)
        return AIMessage(content="tool answer")

    async def sources():
        return {"source:one"}

    async def provision():
        return model

    model = FakeModel(delay)
    monkeypatch.setattr(chat_routing, "decisions_access", fake_access)
    monkeypatch.setattr(chat_routing, "decide_turn", fake_decide)
    monkeypatch.setattr(chat_routing, "invoke_visual_chat", fake_tools)
    reply = await chat_routing.run_turn(
        [HumanMessage(content="Resumime la clase")],
        "SYSTEM",
        provision(),
        toggle=toggle,
        has_sources=True,
        model_id=None,
        source_ids=sources,
    )
    model.reply = reply
    return reply.content, model, tool_payloads


@pytest.mark.asyncio
async def test_without_decisions_the_toggle_keeps_the_tool_loop(monkeypatch):
    content, model, tools = await _run(monkeypatch, access=None, decision=None)
    assert content == "tool answer" and model.calls == 0 and len(tools) == 1


@pytest.mark.asyncio
async def test_fast_answer_runs_while_deciding(monkeypatch):
    content, model, tools = await _run(
        monkeypatch, access=("k", "u"), decision=decision(presentation="table")
    )
    assert content == "fast answer" and model.calls == 1 and tools == []


@pytest.mark.asyncio
async def test_component_decision_restarts_with_the_hint(monkeypatch):
    table = decision(presentation="table", presentation_confidence=0.9)
    content, model, tools = await _run(
        monkeypatch, access=("k", "u"), decision=table, delay=0.2
    )
    assert content == "fast answer" and model.cancelled and model.calls == 2
    assert tools == []


@pytest.mark.asyncio
async def test_visual_decision_cancels_the_speculative_answer(monkeypatch):
    content, model, tools = await _run(
        monkeypatch,
        access=("k", "u"),
        decision=decision(
            visual_tools=True, presentation="chart", presentation_confidence=0.9
        ),
        delay=5,
    )
    assert content == "tool answer" and model.cancelled
    assert "PRESENTATION FOR THIS TURN" in tools[0][0].content


@pytest.mark.asyncio
async def test_failed_decision_falls_back_to_the_toggle(monkeypatch):
    content, model, tools = await _run(
        monkeypatch, access=("k", "u"), decision=None, delay=5
    )
    assert content == "tool answer" and model.cancelled
    content, _, tools = await _run(
        monkeypatch, access=("k", "u"), decision=None, toggle=False
    )
    assert content == "fast answer" and tools == []


def test_presentation_uses_the_chosen_probability():
    answers = [
        ANSWERS[0],
        {
            "type": "choice",
            "name": "presentation",
            "choice": "table",
            "confidence": 0.2,
            "probabilities": [
                {"value": "table", "probability": 0.7},
                {"value": "prose", "probability": 0.3},
            ],
        },
        ANSWERS[2],
    ]
    assert parsed(answers).presentation_confidence == 0.7


def test_step_labels_drop_their_own_numbering():
    raw = '{"type":"steps","items":[{"label":"1. Elegir K"},{"label":"2) Asignar"}]}'
    result = materialize_arc_blocks(f"```arc\n{raw}\n```")
    assert '"Elegir K"' in result and '"Asignar"' in result


@pytest.mark.parametrize(
    ("answer", "expected"),
    [
        ({"type": "predicate", "name": "practice_test", "probability": 0.9}, True),
        ({"type": "predicate", "name": "practice_test", "probability": 0.1}, False),
        ({"type": "refusal", "name": "practice_test"}, None),
        (None, None),
    ],
)
def test_practice_test_intent_is_decided(answer, expected):
    assert parsed(ANSWERS + ([answer] if answer else [])).practice_test is expected


@pytest.mark.asyncio
async def test_decided_test_intent_reaches_the_response_and_is_never_saved(
    monkeypatch,
):
    from open_notebook.utils.chat_routing import pop_practice_test

    _, model, _ = await _run(
        monkeypatch, access=("key", "url"), decision=decision(practice_test=False)
    )
    reply, wants_test = pop_practice_test(model.reply)
    assert wants_test is False
    assert "_turn_practice_test" not in reply.additional_kwargs
    _, model, _ = await _run(monkeypatch, access=None, decision=None)
    assert pop_practice_test(model.reply)[1] is None


@pytest.mark.asyncio
async def test_question_about_an_exam_is_answered_not_turned_into_buttons():
    from langchain_core.messages import AIMessage

    from open_notebook.utils.chat_responses import materialize_chat_response

    request = "en este examen que porcentaje de todos los temas tratamos"
    answer = AIMessage(content="El examen cubrió 9 de 13 temas, cerca del 70 %.")
    reply = await materialize_chat_response(
        answer, "chat_session:x", None, request, wants_test=False
    )
    assert reply.content == answer.content
    assert reply.additional_kwargs["response_followups"] == []
    # Without the Decisions API the keyword heuristic still asks for the format.
    reply = await materialize_chat_response(answer, "chat_session:x", None, request)
    assert reply.additional_kwargs["response_followups"] == [{"kind": "study"}]
