"""OpenAI family rules, checked against the live API on 2026-11-15."""

import pytest
from langchain_openai import ChatOpenAI

from open_notebook.ai.decisions import apply_effort
from open_notebook.ai.openai_models import (
    effort_for_model,
    gpt_version,
    is_reasoning_model,
    supports_effort_none,
    tools_need_responses_api,
)


@pytest.mark.parametrize(
    ("name", "version"),
    [
        ("gpt-6.1-sol", (6, 1)),
        ("gpt-6-luna", (6, 0)),
        ("gpt-5.5-2026-04-23", (5, 5)),
        ("gpt-4.1-mini", (4, 1)),
        ("gpt-4o-mini", None),
        ("gpt-10.2-x", (10, 2)),
        ("o3", None),
        ("text-embedding-3-small", None),
    ],
)
def test_gpt_version(name, version):
    assert gpt_version(name) == version


@pytest.mark.parametrize(
    "name",
    [
        "gpt-5",
        "gpt-5-mini",
        "gpt-5.5",
        "gpt-5.6-terra",
        "gpt-6-astra",
        "gpt-6.1-sol",
        "gpt-6.2-nova",
        "gpt-7",
        "o3",
        "o3-pro",
        "o5-mini",
        "GPT-6-Luna",
    ],
)
def test_reasoning_models(name):
    assert is_reasoning_model(name)
    assert tools_need_responses_api(name)


@pytest.mark.parametrize(
    "name", ["gpt-4.1", "gpt-4o", "gpt-5-chat-latest", "chat-latest", "omni-moderation"]
)
def test_non_reasoning_models(name):
    assert not is_reasoning_model(name)
    assert not tools_need_responses_api(name)


@pytest.mark.parametrize(
    ("name", "accepts_none"),
    [
        ("gpt-6-luna", True),
        ("gpt-6-sol", True),
        ("gpt-6.1-terra", True),
        ("gpt-5.6-sol", True),
        ("gpt-5.5", True),
        ("gpt-6.1-sol", False),
        ("gpt-6.1-sol-2026-10-01", False),
        ("gpt-6-astra", False),
        ("gpt-5", False),
        ("gpt-5-mini", False),
        ("o3", False),
    ],
)
def test_effort_none_support(name, accepts_none):
    assert supports_effort_none(name) is accepts_none
    assert effort_for_model(name, "none") == ("none" if accepts_none else "low")
    assert effort_for_model(name, "high") == "high"


def test_apply_effort_downgrades_unsupported_none():
    sol = ChatOpenAI(model="gpt-6.1-sol", api_key="x")
    assert apply_effort(sol, "none").reasoning_effort == "low"
    assert apply_effort(sol, "high").reasoning_effort == "high"
    o3 = ChatOpenAI(model="o3", api_key="x")
    assert apply_effort(o3, "none").reasoning_effort == "low"
    newer = ChatOpenAI(model="gpt-7", api_key="x")
    assert apply_effort(newer, "medium").reasoning_effort == "medium"
    assert apply_effort(sol, "max") is sol
