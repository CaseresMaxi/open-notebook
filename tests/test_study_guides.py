from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from api import study_guide_service as service
from open_notebook.domain.study_guide import StudyGuide
from open_notebook.exceptions import InvalidInputError
from open_notebook.graphs.study_guide import (
    GeneratedFlashcard,
    GeneratedGuide,
    GeneratedTopic,
    validate_generated_guide,
)
from open_notebook.study_planning import (
    CardState,
    PlannedTopic,
    StudySession,
    build_schedule,
    history_from_sessions,
    order_topics,
    review_card,
    study_days,
)

MONDAY = date(2026, 11, 9)
WEEKDAYS = [0, 1, 2, 3, 4]


def _topics(n: int = 4) -> list[PlannedTopic]:
    return [
        PlannedTopic(
            id=f"t{i}",
            prerequisites=[f"t{i - 1}"] if i > 1 else [],
            difficulty="medium",
        )
        for i in range(1, n + 1)
    ]


def _days_of(plan, kind):
    return {
        topic: date.fromisoformat(s.date)
        for s in plan.sessions
        for a in s.activities
        if a.type == kind
        for topic in a.topic_ids
    }


def test_order_topics_puts_prerequisites_first_and_survives_cycles():
    topics = [
        PlannedTopic(id="b", prerequisites=["a"]),
        PlannedTopic(id="a"),
        PlannedTopic(id="x", prerequisites=["y"]),
        PlannedTopic(id="y", prerequisites=["x"]),
    ]
    order = [t.id for t in order_topics(topics)]
    assert order.index("a") < order.index("b")
    assert sorted(order) == ["a", "b", "x", "y"]


def test_study_days_respects_weekdays_and_skips_exam_day():
    days = study_days(MONDAY, MONDAY + timedelta(days=7), WEEKDAYS, skip_end=True)
    assert [d.weekday() for d in days] == [0, 1, 2, 3, 4]
    assert MONDAY + timedelta(days=7) not in days


def test_schedule_spaces_reviews_after_learning():
    exam = MONDAY + timedelta(days=28)
    plan = build_schedule(
        _topics(),
        start=MONDAY,
        end=exam,
        weekdays=WEEKDAYS,
        minutes_per_session=45,
        exam_date=exam,
    )
    learned = _days_of(plan, "learn")
    assert set(learned) == {"t1", "t2", "t3", "t4"}
    # Prerequisites are learned no later than the topics that need them.
    assert learned["t1"] <= learned["t2"] <= learned["t3"] <= learned["t4"]

    review_dates = sorted(
        date.fromisoformat(s.date)
        for s in plan.sessions
        for a in s.activities
        if a.type in ("retrieval", "interleaved_practice") and "t1" in a.topic_ids
    )
    assert len(review_dates) >= 3
    assert review_dates[0] > learned["t1"]
    gaps = [(b - a).days for a, b in zip(review_dates, review_dates[1:])]
    # Expanding spacing: each gap is at least as long as the previous one.
    assert gaps == sorted(gaps)

    # Nothing is scheduled on or after the exam day, and the last session is
    # a cumulative mock exam with no new learning.
    assert all(date.fromisoformat(s.date) < exam for s in plan.sessions)
    last = plan.sessions[-1]
    assert [a.type for a in last.activities if a.type == "learn"] == []
    assert any(
        a.type == "practice_exam" and len(a.topic_ids) == 4 for a in last.activities
    )
    assert plan.overloaded is False


def test_schedule_opens_with_pretest_and_interleaves_reviews():
    plan = build_schedule(
        _topics(),
        start=MONDAY,
        end=MONDAY + timedelta(days=20),
        weekdays=WEEKDAYS,
        minutes_per_session=60,
    )
    first = plan.sessions[0]
    assert first.activities[0].type == "pretest"
    assert all(a.type != "flashcards" for a in first.activities), (
        "no flashcards before anything was learned"
    )
    interleaved = [
        a
        for s in plan.sessions
        for a in s.activities
        if a.type == "interleaved_practice"
    ]
    assert interleaved and all(len(a.topic_ids) > 1 for a in interleaved)


def test_schedule_keeps_sessions_near_the_time_budget():
    plan = build_schedule(
        _topics(6),
        start=MONDAY,
        end=MONDAY + timedelta(days=40),
        weekdays=WEEKDAYS,
        minutes_per_session=30,
    )
    learning_sessions = [
        s for s in plan.sessions if any(a.type == "learn" for a in s.activities)
    ]
    assert learning_sessions
    assert all(s.minutes <= 30 for s in learning_sessions)


def test_schedule_flags_overload_when_time_is_too_short():
    exam = MONDAY + timedelta(days=2)
    plan = build_schedule(
        _topics(6),
        start=MONDAY,
        end=exam,
        weekdays=range(7),
        minutes_per_session=30,
        exam_date=exam,
    )
    assert plan.overloaded is True
    assert set(_days_of(plan, "learn")) == {f"t{i}" for i in range(1, 7)}


def test_review_card_follows_sm2_and_relearns_failures():
    today = MONDAY
    state = review_card(CardState(), "good", today)
    assert (state.interval, state.repetitions, state.due) == (
        1,
        1,
        (today + timedelta(days=1)).isoformat(),
    )
    state = review_card(state, "good", today)
    assert state.interval == 3
    longer = review_card(state, "good", today)
    assert longer.interval == round(3 * state.ease)

    failed = review_card(longer, "again", today)
    assert failed.due == today.isoformat()
    assert failed.repetitions == 0 and failed.lapses == 1
    assert failed.ease < longer.ease
    assert failed.reviews == 4 and failed.correct == 3


def test_review_card_never_schedules_past_the_exam():
    exam = MONDAY + timedelta(days=5)
    state = CardState(interval=30, repetitions=4)
    nxt = review_card(state, "easy", MONDAY, exam)
    assert nxt.due == (exam - timedelta(days=1)).isoformat()


def test_history_counts_completed_learning_and_reviews():
    sessions = [
        StudySession(
            id="2026-11-09",
            date="2026-11-09",
            minutes=40,
            activities=[
                {"id": "a-learn", "type": "learn", "topic_ids": ["t1"], "minutes": 30},
                {"id": "b-learn", "type": "learn", "topic_ids": ["t2"], "minutes": 30},
            ],
        ),
        StudySession(
            id="2026-11-10",
            date="2026-11-10",
            minutes=8,
            activities=[
                {"id": "a-rev", "type": "retrieval", "topic_ids": ["t1"], "minutes": 8}
            ],
        ),
    ]
    history = history_from_sessions(
        sessions, {"a-learn", "a-rev"}, {"t2": 2}, before=date(2026, 11, 11)
    )
    assert history["t1"].learned_on == date(2026, 11, 9)
    assert history["t1"].reviews_done == 1
    assert history["t1"].last_review_on == date(2026, 11, 10)
    assert history["t2"].learned_on is None and history["t2"].confidence == 2


def test_validate_generated_guide_assigns_ids_and_filters_references():
    generated = GeneratedGuide(
        title="Cells",
        topics=[
            GeneratedTopic(
                title="Membranes",
                source_ids=["source:1", "source:404"],
                prerequisites=[0, 3],
                flashcards=[
                    GeneratedFlashcard(front="What is a membrane?", back="A barrier"),
                    GeneratedFlashcard(front=" ", back="empty"),
                ],
            ),
            GeneratedTopic(title="  "),
            GeneratedTopic(title="Transport", prerequisites=[0, 2]),
        ],
    )
    topics, cards = validate_generated_guide(generated, ["source:1"])
    assert [t.id for t in topics] == ["t1", "t2"]
    assert topics[0].source_ids == ["source:1"]
    assert topics[0].prerequisites == []  # self/later references are dropped
    assert topics[1].prerequisites == ["t1"]
    assert [(c.id, c.topic_id) for c in cards] == [("c1", "t1")]


def test_resolve_dates_validates_exam_and_duration():
    assert service.resolve_dates(MONDAY, None, 7) == MONDAY + timedelta(days=6)
    assert service.resolve_dates(MONDAY, MONDAY + timedelta(days=3), None) == (
        MONDAY + timedelta(days=3)
    )
    with pytest.raises(InvalidInputError):
        service.resolve_dates(MONDAY, MONDAY, None)


def _guide(**overrides) -> StudyGuide:
    plan = build_schedule(
        _topics(2),
        start=MONDAY,
        end=MONDAY + timedelta(days=13),
        weekdays=WEEKDAYS,
        minutes_per_session=45,
    )
    data = dict(
        id="study_guide:1",
        notebook_id="notebook:1",
        title="Plan",
        start_date=MONDAY.isoformat(),
        end_date=(MONDAY + timedelta(days=13)).isoformat(),
        topics=[
            {"id": "t1", "title": "One"},
            {"id": "t2", "title": "Two", "prerequisites": ["t1"]},
        ],
        cards=[
            {"id": "c1", "topic_id": "t1", "front": "Q1", "back": "A1"},
            {"id": "c2", "topic_id": "t2", "front": "Q2", "back": "A2"},
        ],
        sessions=[s.model_dump() for s in plan.sessions],
        created=datetime(2026, 11, 9),
        updated=datetime(2026, 11, 9),
    )
    data.update(overrides)
    return StudyGuide(**data)


def test_due_cards_include_new_cards_only_for_learned_topics():
    guide = _guide()
    learn_t1 = next(
        a["id"]
        for s in guide.sessions
        for a in s["activities"]
        if a["type"] == "learn" and a["topic_ids"] == ["t1"]
    )
    assert service.due_card_ids(guide, MONDAY) == []
    guide.completed_activities = [learn_t1]
    assert service.due_card_ids(guide, MONDAY) == ["c1"]
    guide.card_states = {
        "c1": CardState(due=(MONDAY + timedelta(days=2)).isoformat()).model_dump()
    }
    assert service.due_card_ids(guide, MONDAY) == []


@pytest.mark.asyncio
async def test_reschedule_keeps_done_work_and_drops_missed_activities():
    guide = _guide()
    first = guide.sessions[0]
    learn_t1 = next(a["id"] for a in first["activities"] if a["type"] == "learn")
    guide.completed_activities = [learn_t1]
    later = MONDAY + timedelta(days=3)
    with patch.object(StudyGuide, "save", new_callable=AsyncMock):
        await service.reschedule(guide, today=later)

    past = [s for s in guide.sessions if s["date"] < later.isoformat()]
    assert [a["id"] for s in past for a in s["activities"]] == [learn_t1]
    future = [s for s in guide.sessions if s["date"] >= later.isoformat()]
    learns = [
        a["topic_ids"] for s in future for a in s["activities"] if a["type"] == "learn"
    ]
    assert learns == [["t2"]], "t1 was learned; only its reviews remain"
    assert guide.completed_activities == [learn_t1]


@pytest.mark.asyncio
async def test_create_requires_sources_or_topics():
    with pytest.raises(InvalidInputError):
        await service.create_study_guide(
            notebook_id="notebook:1",
            source_ids=[],
            include_notes=False,
            focus_topics=[" "],
            goal="understand",
            level="beginner",
            start_date=MONDAY.isoformat(),
            exam_date=None,
            duration_days=7,
            weekdays=WEEKDAYS,
            minutes_per_session=30,
            language=None,
            instructions=None,
            title=None,
            model_id=None,
        )


@pytest.mark.asyncio
async def test_create_topics_only_guide_is_marked_ungrounded():
    notebook = MagicMock(name="notebook")
    notebook.name = "Biology"
    notebook.get_sources = AsyncMock(return_value=[])
    content = AsyncMock(
        return_value=(
            "Cells",
            "Overview",
            [],
            validate_generated_guide(
                GeneratedGuide(title="Cells", topics=[GeneratedTopic(title="Mitosis")]),
                [],
            )[0],
            [],
        )
    )
    with (
        patch("api.study_guide_service.Notebook.get", AsyncMock(return_value=notebook)),
        patch("api.study_guide_service.build_study_material", AsyncMock()) as material,
        patch("api.study_guide_service.generate_study_guide_content", content),
        patch.object(StudyGuide, "save", new_callable=AsyncMock),
    ):
        guide = await service.create_study_guide(
            notebook_id="notebook:1",
            source_ids=[],
            include_notes=False,
            focus_topics=["Mitosis", "mitosis ", "Mitosis"],
            goal="memorize",
            level="beginner",
            start_date=MONDAY.isoformat(),
            exam_date=None,
            duration_days=7,
            weekdays=WEEKDAYS,
            minutes_per_session=30,
            language=None,
            instructions=None,
            title=None,
            model_id=None,
        )
    material.assert_not_called()
    assert content.await_args is not None
    assert content.await_args.args[0] is None
    assert guide.grounded is False
    assert guide.focus_topics == ["Mitosis", "mitosis"]
    assert guide.sessions and guide.end_date == (MONDAY + timedelta(days=6)).isoformat()


def test_review_endpoint_updates_card_and_returns_details():
    from api.main import app

    guide = _guide(completed_activities=[])
    client = TestClient(app)
    with (
        patch(
            "api.routers.study_guides.StudyGuide.get",
            AsyncMock(return_value=guide),
        ),
        patch.object(StudyGuide, "save", new_callable=AsyncMock),
    ):
        response = client.post(
            "/api/study-guides/study_guide:1/cards/c1/review",
            json={"rating": "good", "today": MONDAY.isoformat()},
        )
        missing = client.post(
            "/api/study-guides/study_guide:1/cards/c9/review",
            json={"rating": "good", "today": MONDAY.isoformat()},
        )
    assert response.status_code == 200
    body = response.json()
    card = next(c for c in body["cards"] if c["id"] == "c1")
    assert card["state"]["due"] == (MONDAY + timedelta(days=1)).isoformat()
    assert set(card["next_intervals"]) == {"again", "hard", "good", "easy"}
    assert body["topic_stats"]["t1"]["reviews"] == 1
    assert missing.status_code == 404
