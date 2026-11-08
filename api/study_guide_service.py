"""Study guides: generate a personalized plan and track study progress."""

import asyncio
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from api.exam_service import build_study_material
from open_notebook.domain.exam import ExamQuestion
from open_notebook.domain.notebook import Notebook
from open_notebook.domain.study_guide import Grade, StudyGuide, StudyResponse
from open_notebook.exceptions import InvalidInputError, NotFoundError
from open_notebook.graphs.study_guide import generate_study_guide_content
from open_notebook.study_planning import (
    CardState,
    PlannedTopic,
    Rating,
    StudySession,
    build_schedule,
    history_from_sessions,
    is_due,
    is_mastered,
    review_card,
    study_days,
)

DEFAULT_DURATION_DAYS = 14
# Answer history kept per question; older attempts beyond this are dropped.
MAX_RESPONSES_PER_KEY = 100
_TOPIC_KEY = re.compile(
    r"^(t\d+):(practice|elaboration):(\d+)$|^(t\d+):(self_explain|dual_coding|recall|example)$"
)
RATING_GRADE: Dict[str, Grade] = {
    "again": "incorrect",
    "hard": "partial",
    "good": "correct",
    "easy": "correct",
}
MAX_DURATION_DAYS = 180
MAX_FOCUS_TOPICS = 20


def _parse_date(value: Optional[str], field: str) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError as e:
        raise InvalidInputError(f"Invalid {field}: use YYYY-MM-DD.") from e


def resolve_dates(
    start: date, exam_date: Optional[date], duration_days: Optional[int]
) -> date:
    """The plan's last day: the exam day, or the end of the chosen duration."""
    if exam_date:
        if exam_date <= start:
            raise InvalidInputError("The exam date must be after the start date.")
        if (exam_date - start).days > MAX_DURATION_DAYS:
            raise InvalidInputError(
                f"A study plan can span at most {MAX_DURATION_DAYS} days."
            )
        return exam_date
    days = duration_days or DEFAULT_DURATION_DAYS
    if not 1 <= days <= MAX_DURATION_DAYS:
        raise InvalidInputError(
            f"The plan duration must be between 1 and {MAX_DURATION_DAYS} days."
        )
    return start + timedelta(days=days - 1)


def _clean_weekdays(weekdays: List[int]) -> List[int]:
    clean = sorted({d for d in weekdays if 0 <= d <= 6})
    if not clean:
        raise InvalidInputError("Choose at least one study day of the week.")
    return clean


def _planned(guide: StudyGuide) -> List[PlannedTopic]:
    return [
        PlannedTopic(id=t.id, difficulty=t.difficulty, prerequisites=t.prerequisites)
        for t in guide.get_topics()
    ]


async def create_study_guide(
    *,
    notebook_id: str,
    source_ids: Optional[List[str]],
    include_notes: bool,
    focus_topics: List[str],
    goal: str,
    level: str,
    start_date: Optional[str],
    exam_date: Optional[str],
    duration_days: Optional[int],
    weekdays: List[int],
    minutes_per_session: int,
    language: Optional[str],
    instructions: Optional[str],
    title: Optional[str],
    model_id: Optional[str],
) -> StudyGuide:
    topics_requested = [t.strip() for t in focus_topics if t and t.strip()]
    topics_requested = list(dict.fromkeys(topics_requested))[:MAX_FOCUS_TOPICS]
    start = _parse_date(start_date, "start date") or date.today()
    exam = _parse_date(exam_date, "exam date")
    end = resolve_dates(start, exam, duration_days)
    days = _clean_weekdays(weekdays)
    session_count = len(study_days(start, end, days, skip_end=exam is not None))
    if session_count == 0:
        raise InvalidInputError(
            "There is no study day before the end of the plan. "
            "Choose more days of the week or a later date."
        )

    # An explicit empty source list means "only the topics I typed".
    use_material = source_ids != [] or include_notes
    if not use_material and not topics_requested:
        raise InvalidInputError(
            "Choose at least one source or write the topics you want to study."
        )

    notebook = await Notebook.get(notebook_id)
    material: Optional[str] = None
    used_ids: List[str] = []
    if use_material:
        material, used_ids = await build_study_material(
            notebook, source_ids or None, include_notes
        )

    titles = {s.id: s.title for s in await notebook.get_sources()}
    sources = [{"id": sid, "title": titles.get(sid) or sid} for sid in used_ids]
    (
        generated_title,
        overview,
        gaps,
        topics,
        cards,
    ) = await generate_study_guide_content(
        material,
        sources=sources,
        goal=goal,
        level=level,
        focus_topics=topics_requested,
        session_count=session_count,
        minutes_per_session=minutes_per_session,
        days_until_exam=(exam - start).days if exam else None,
        language=language,
        instructions=instructions,
        model_id=model_id,
    )

    plan = build_schedule(
        [
            PlannedTopic(
                id=t.id, difficulty=t.difficulty, prerequisites=t.prerequisites
            )
            for t in topics
        ],
        start=start,
        end=end,
        weekdays=days,
        minutes_per_session=minutes_per_session,
        exam_date=exam,
    )
    guide = StudyGuide(
        notebook_id=notebook_id,
        title=(title or "").strip() or generated_title or notebook.name,
        overview=overview,
        goal=goal,  # type: ignore[arg-type]
        level=level,  # type: ignore[arg-type]
        language=language,
        instructions=instructions,
        focus_topics=topics_requested,
        source_ids=used_ids,
        include_notes=include_notes,
        grounded=material is not None,
        coverage_gaps=gaps,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        exam_date=exam.isoformat() if exam else None,
        weekdays=days,
        minutes_per_session=minutes_per_session,
        overloaded=plan.overloaded,
        topics=[t.model_dump() for t in topics],
        cards=[c.model_dump() for c in cards],
        sessions=[s.model_dump() for s in plan.sessions],
        model_id=model_id,
    )
    await guide.save()
    return guide


def sessions_of(guide: StudyGuide) -> List[StudySession]:
    return [StudySession(**s) for s in guide.sessions]


def activity_ids(guide: StudyGuide) -> set[str]:
    return {a.id for s in sessions_of(guide) for a in s.activities}


def learned_topics(guide: StudyGuide, today: date) -> set[str]:
    """Topics whose learning block is done, or whose learning day has passed."""
    done = set(guide.completed_activities)
    learned: set[str] = set()
    for session in sessions_of(guide):
        past = date.fromisoformat(session.date) < today
        for activity in session.activities:
            if activity.type == "learn" and (past or activity.id in done):
                learned.update(activity.topic_ids)
    return learned


def due_card_ids(guide: StudyGuide, today: date) -> List[str]:
    """Cards to review today: those due, then new cards of learned topics."""
    states = guide.card_states
    learned = learned_topics(guide, today)
    due: List[str] = []
    new: List[str] = []
    for card in guide.get_cards():
        raw = states.get(card.id)
        if raw is None:
            if card.topic_id in learned:
                new.append(card.id)
        elif is_due(CardState(**raw), today):
            due.append(card.id)
    return due + new


async def set_activity_done(guide: StudyGuide, activity_id: str, done: bool) -> None:
    if activity_id not in activity_ids(guide):
        raise NotFoundError("Activity not found in this study guide.")
    completed = [a for a in guide.completed_activities if a != activity_id]
    if done:
        completed.append(activity_id)
    guide.completed_activities = completed
    await guide.save()


async def set_topic_confidence(
    guide: StudyGuide, topic_id: str, confidence: int
) -> None:
    if topic_id not in {t.id for t in guide.get_topics()}:
        raise NotFoundError("Topic not found in this study guide.")
    guide.topic_confidence = {**guide.topic_confidence, topic_id: confidence}
    await guide.save()


def validate_response_key(guide: StudyGuide, key: str) -> None:
    """Keys name a question of this guide:

    - ``t1:practice:0`` / ``t1:elaboration:0``: a practice or why/how question
    - ``t1:self_explain``, ``t1:dual_coding``, ``t1:recall``, ``t1:example``:
      the topic's self-explanation, visual, free recall and own example
    - ``card:c1``: a flashcard
    """
    if key.startswith("card:"):
        if key[5:] not in {c.id for c in guide.get_cards()}:
            raise NotFoundError("Flashcard not found in this study guide.")
        return
    match = _TOPIC_KEY.match(key)
    if not match:
        raise InvalidInputError(f"Unknown question key: {key}")
    topics = {t.id: t for t in guide.get_topics()}
    topic = topics.get(match.group(1) or match.group(4) or "")
    if topic is None:
        raise NotFoundError("Topic not found in this study guide.")
    if match.group(2):
        items = (
            topic.practice_questions
            if match.group(2) == "practice"
            else topic.elaboration_questions
        )
        if int(match.group(3)) >= len(items):
            raise NotFoundError("Question not found in this study guide.")


def _append_response(guide: StudyGuide, key: str, response: StudyResponse) -> None:
    history = [*guide.responses.get(key, []), response.model_dump()]
    guide.responses = {**guide.responses, key: history[-MAX_RESPONSES_PER_KEY:]}


async def save_response(
    guide: StudyGuide,
    key: str,
    answer: Any,
    context: str,
    grade: Optional[Grade] = None,
) -> StudyResponse:
    """Store the learner's answer to a question; earlier answers are kept."""
    from open_notebook.storage import retain_images
    from open_notebook.utils.exam_answers import open_answer

    validate_response_key(guide, key)
    opened = open_answer(answer)
    if not opened.text.strip() and not opened.images:
        raise InvalidInputError("Write an answer or attach an image first.")
    await asyncio.to_thread(retain_images, opened.images)
    response = StudyResponse(
        id=uuid.uuid4().hex[:12],
        text=opened.text,
        images=opened.images,
        context=(context or "topic")[:200],
        grade=grade,
        created=datetime.now(timezone.utc).isoformat(timespec="seconds"),
    )
    _append_response(guide, key, response)
    await guide.save()
    return response


def _find_response(guide: StudyGuide, response_id: str) -> tuple[str, int]:
    for key, history in guide.responses.items():
        for index, item in enumerate(history):
            if item.get("id") == response_id:
                return key, index
    raise NotFoundError("Answer not found in this study guide.")


async def grade_response(
    guide: StudyGuide, response_id: str, grade: Optional[Grade]
) -> None:
    """The learner's own check after comparing with the reference answer."""
    key, index = _find_response(guide, response_id)
    history = list(guide.responses[key])
    history[index] = {**history[index], "grade": grade, "graded_by": "self"}
    guide.responses = {**guide.responses, key: history}
    await guide.save()


# Open answers the learner cannot check against a short key: analyzed by the
# AI right after saving. Short answers (practice questions, flashcards) are
# self-checked against the key and analyzed only on request.
AUTO_ANALYZE_KINDS = {"elaboration", "self_explain", "recall", "example", "dual_coding"}


def response_kind(key: str) -> str:
    return "card" if key.startswith("card:") else key.split(":")[1]


def question_for_key(guide: StudyGuide, key: str) -> ExamQuestion:
    """The question, reference and rubric an answer is analyzed against."""
    validate_response_key(guide, key)
    if key.startswith("card:"):
        card = next(c for c in guide.get_cards() if c.id == key[5:])
        prompt, reference = card.front, card.back
        rubric = "Short recall answer: accept equivalent wording; check the key fact."
    else:
        topic = next(t for t in guide.get_topics() if t.id == key.split(":")[0])
        ideas = "\n".join(f"- {idea}" for idea in topic.key_ideas) or topic.summary
        kind = response_kind(key)
        if kind == "practice":
            q = topic.practice_questions[int(key.split(":")[2])]
            prompt, reference = q.question, q.answer
            rubric = "Accept equivalent wording; check the key facts and reasoning."
        elif kind == "elaboration":
            prompt = topic.elaboration_questions[int(key.split(":")[2])]
            reference = f"{topic.summary}\nKey ideas of the topic:\n{ideas}"
            rubric = (
                "A why/how question: a good answer explains causes or mechanisms and "
                "connects ideas correctly. There is no model answer; judge correctness "
                "and depth against the key ideas and point out wrong or missing links."
            )
        elif kind == "self_explain":
            prompt = topic.self_explanation_prompt or f"Explain {topic.title}."
            reference = ideas
            rubric = (
                "Self-explanation without notes: credit each key idea explained "
                "correctly in the learner's own words. List the key ideas missing."
            )
        elif kind == "recall":
            prompt = f"Write from memory everything you remember about: {topic.title}"
            reference = ideas
            rubric = (
                "Free recall: score the share of key ideas recalled correctly; flag "
                "errors and name the key ideas that were not recalled."
            )
        elif kind == "example":
            prompt = f"Give your own concrete example of: {topic.title}"
            reference = "Examples from the material:\n" + "\n".join(
                f"- {e}" for e in topic.concrete_examples
            )
            reference += f"\nKey ideas:\n{ideas}"
            rubric = (
                "The example must be a correct, specific application of the key ideas. "
                "It may differ from the material's examples; do not reward copying them."
            )
        else:
            prompt = topic.dual_coding_task or f"Draw a diagram of {topic.title}."
            reference = ideas
            diagram = guide.diagram_references.get(topic.id)
            if diagram:
                # The reference diagram as text (arc JSON / HTML description).
                reference += "\nReference diagram:\n" + diagram.get("markdown", "")
                if diagram.get("visual"):
                    reference += "\n" + diagram["visual"].get("description", "")
            rubric = (
                "A visual (diagram, map, timeline, table), usually an image: check it "
                "contains the parts the task asks for and that relations are correct."
            )
    return ExamQuestion(
        id=key,
        type="open",
        prompt=prompt,
        points=1.0,
        reference_answer=reference,
        rubric=rubric,
    )


def grade_from_score(score: float) -> Grade:
    return "correct" if score >= 0.85 else "partial" if score >= 0.4 else "incorrect"


async def analyze_response(guide: StudyGuide, response_id: str) -> Dict[str, Any]:
    """Ask the model for feedback on a stored answer and keep it with it."""
    from open_notebook.graphs.exam import grade_with_ai
    from open_notebook.utils.exam_answers import open_answer

    key, index = _find_response(guide, response_id)
    question = question_for_key(guide, key)
    stored = guide.responses[key][index]
    answer = open_answer(
        {"text": stored.get("text", ""), "images": stored.get("images", [])}
    )
    score, feedback = await grade_with_ai(
        question,
        answer.text,
        language=guide.language,
        model_id=guide.model_id,
        answer_images=answer.images or None,
    )
    history = list(guide.responses[key])
    history[index] = {
        **history[index],
        "score": round(score, 2),
        "feedback": feedback,
        "grade": grade_from_score(score),
        "graded_by": "ai",
    }
    guide.responses = {**guide.responses, key: history}
    await guide.save()
    return history[index]


async def ensure_reference_diagram(
    guide: StudyGuide, topic_id: str, regenerate: bool = False
) -> Dict[str, Any]:
    """Generate (once) the reference diagram of a topic's dual-coding task."""
    from open_notebook.graphs.study_guide import generate_reference_diagram

    topic = next((t for t in guide.get_topics() if t.id == topic_id), None)
    if topic is None:
        raise NotFoundError("Topic not found in this study guide.")
    if topic_id in guide.diagram_references and not regenerate:
        return guide.diagram_references[topic_id]
    diagram = await generate_reference_diagram(
        topic, language=guide.language, model_id=guide.model_id
    )
    diagram["created"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    guide.diagram_references = {**guide.diagram_references, topic_id: diagram}
    await guide.save()
    return diagram


async def delete_response(guide: StudyGuide, response_id: str) -> None:
    key, index = _find_response(guide, response_id)
    history = [r for i, r in enumerate(guide.responses[key]) if i != index]
    responses = dict(guide.responses)
    if history:
        responses[key] = history
    else:
        responses.pop(key)
    guide.responses = responses
    await guide.save()


async def review_flashcard(
    guide: StudyGuide,
    card_id: str,
    rating: Rating,
    today: date,
    answer: Optional[str] = None,
) -> CardState:
    if card_id not in {c.id for c in guide.get_cards()}:
        raise NotFoundError("Flashcard not found in this study guide.")
    if answer and answer.strip():
        # Kept like any other answer; graded by the learner's own rating.
        _append_response(
            guide,
            f"card:{card_id}",
            StudyResponse(
                id=uuid.uuid4().hex[:12],
                text=answer.strip()[:50_000],
                context="flashcards",
                grade=RATING_GRADE[rating],
                created=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
    current = CardState(**guide.card_states.get(card_id, {}))
    exam = _parse_date(guide.exam_date, "exam date")
    updated = review_card(current, rating, today, exam)
    guide.card_states = {**guide.card_states, card_id: updated.model_dump()}
    await guide.save()
    return updated


async def reschedule(
    guide: StudyGuide,
    *,
    today: date,
    exam_date: Optional[str] = None,
    end_date: Optional[str] = None,
    weekdays: Optional[List[int]] = None,
    minutes_per_session: Optional[int] = None,
) -> StudyGuide:
    """Replan from today: keep what was done, spread what is left.

    Missed activities are dropped from past sessions; topics already learned
    only get their remaining spaced reviews, counted from the last one done.
    """
    exam = _parse_date(exam_date, "exam date") if exam_date else None
    if exam is None and guide.exam_date and not end_date:
        exam = _parse_date(guide.exam_date, "exam date")
    end = (
        exam or _parse_date(end_date, "end date") or date.fromisoformat(guide.end_date)
    )
    # The exam day itself is not a study day; a plain plan's last day is.
    ended = end <= today if exam else end < today
    if ended:
        raise InvalidInputError(
            "The plan has already ended. Choose a new end or exam date."
        )
    if (end - today).days > MAX_DURATION_DAYS:
        raise InvalidInputError(
            f"A study plan can span at most {MAX_DURATION_DAYS} days."
        )
    days = _clean_weekdays(weekdays if weekdays is not None else guide.weekdays)
    minutes = minutes_per_session or guide.minutes_per_session

    sessions = sessions_of(guide)
    completed = set(guide.completed_activities)
    history = history_from_sessions(
        sessions, completed, guide.topic_confidence, before=today
    )
    kept: List[StudySession] = []
    for session in sessions:
        if date.fromisoformat(session.date) >= today:
            continue
        done = [a for a in session.activities if a.id in completed]
        if done:
            kept.append(
                session.model_copy(
                    update={
                        "activities": done,
                        "minutes": sum(a.minutes for a in done),
                    }
                )
            )
    plan = build_schedule(
        _planned(guide),
        start=today,
        end=end,
        weekdays=days,
        minutes_per_session=minutes,
        exam_date=exam,
        history={k: v for k, v in history.items() if v.learned_on},
        pretest=False,
    )
    all_sessions = kept + plan.sessions
    valid = {a.id for s in all_sessions for a in s.activities}
    guide.sessions = [s.model_dump() for s in all_sessions]
    guide.completed_activities = [a for a in guide.completed_activities if a in valid]
    guide.end_date = end.isoformat()
    guide.exam_date = exam.isoformat() if exam else None
    guide.weekdays = days
    guide.minutes_per_session = minutes
    guide.overloaded = plan.overloaded
    await guide.save()
    return guide


def topic_stats(guide: StudyGuide) -> Dict[str, Dict[str, Optional[float]]]:
    """Per-topic flashcard recall, for progress and confidence calibration."""
    stats: Dict[str, Dict[str, Optional[float]]] = {}
    for topic in guide.get_topics():
        stats[topic.id] = {"cards": 0, "mastered": 0, "reviews": 0, "correct": 0}
    for card in guide.get_cards():
        entry = stats.get(card.topic_id)
        if entry is None:
            continue
        state = CardState(**guide.card_states.get(card.id, {}))
        entry["cards"] = (entry["cards"] or 0) + 1
        entry["reviews"] = (entry["reviews"] or 0) + state.reviews
        entry["correct"] = (entry["correct"] or 0) + state.correct
        if is_mastered(state):
            entry["mastered"] = (entry["mastered"] or 0) + 1
    for entry in stats.values():
        reviews = entry["reviews"] or 0
        entry["recall_rate"] = (entry["correct"] or 0) / reviews if reviews else None
    return stats
