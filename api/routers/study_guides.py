"""Personalized study guides: evidence-based plans built from notebook sources."""

from datetime import date
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from api import study_guide_service as service
from open_notebook.ai.models import Model
from open_notebook.domain.study_guide import StudyGuide
from open_notebook.exceptions import InvalidInputError
from open_notebook.study_planning import CardState, preview_intervals

router = APIRouter()


class StudyGuideCreateRequest(BaseModel):
    notebook_id: str = Field(..., description="Notebook whose material the guide uses")
    source_ids: Optional[List[str]] = Field(
        None,
        description="Sources to use: all notebook sources if omitted, none if [] (topics only)",
    )
    include_notes: bool = Field(False, description="Also use the notebook's notes")
    focus_topics: List[str] = Field(
        default_factory=list,
        max_length=20,
        description="Topics to focus on; required when no sources are used",
    )
    goal: Literal["understand", "memorize", "exam", "apply"] = "understand"
    level: Literal["beginner", "intermediate", "advanced"] = "intermediate"
    start_date: Optional[str] = Field(
        None, description="First study day, YYYY-MM-DD (today if omitted)"
    )
    exam_date: Optional[str] = Field(
        None, description="Exam day, YYYY-MM-DD; the plan ends the day before"
    )
    duration_days: Optional[int] = Field(
        None, ge=1, le=180, description="Plan length when there is no exam date"
    )
    weekdays: List[int] = Field(
        default_factory=lambda: [0, 1, 2, 3, 4],
        description="Study days of the week, 0 = Monday ... 6 = Sunday",
    )
    minutes_per_session: int = Field(45, ge=15, le=240)
    language: Optional[str] = Field(None, max_length=40)
    instructions: Optional[str] = Field(None, max_length=2000)
    title: Optional[str] = Field(None, max_length=200)
    model_id: Optional[str] = None


class ActivityProgressRequest(BaseModel):
    activity_id: str
    done: bool = True


class TopicConfidenceRequest(BaseModel):
    confidence: int = Field(..., ge=1, le=5)


class CardReviewRequest(BaseModel):
    rating: Literal["again", "hard", "good", "easy"]
    today: Optional[str] = Field(None, description="Learner's local date, YYYY-MM-DD")


class RescheduleRequest(BaseModel):
    today: Optional[str] = Field(None, description="Learner's local date, YYYY-MM-DD")
    exam_date: Optional[str] = None
    end_date: Optional[str] = None
    weekdays: Optional[List[int]] = None
    minutes_per_session: Optional[int] = Field(None, ge=15, le=240)


class FlashcardResponse(BaseModel):
    id: str
    topic_id: str
    front: str
    back: str
    state: Dict[str, Any]
    next_intervals: Dict[str, int]


class StudyGuideResponse(BaseModel):
    id: str
    notebook_id: str
    title: str
    overview: str
    goal: str
    level: str
    language: Optional[str] = None
    instructions: Optional[str] = None
    focus_topics: List[str]
    source_ids: List[str]
    include_notes: bool
    grounded: bool
    coverage_gaps: List[str]
    start_date: str
    end_date: str
    exam_date: Optional[str] = None
    weekdays: List[int]
    minutes_per_session: int
    overloaded: bool
    topic_count: int
    card_count: int
    activity_count: int
    completed_count: int
    due_card_count: int
    next_session_date: Optional[str] = None
    topics: Optional[List[Dict[str, Any]]] = None
    sessions: Optional[List[Dict[str, Any]]] = None
    cards: Optional[List[FlashcardResponse]] = None
    due_card_ids: Optional[List[str]] = None
    completed_activities: Optional[List[str]] = None
    topic_confidence: Optional[Dict[str, int]] = None
    topic_stats: Optional[Dict[str, Dict[str, Optional[float]]]] = None
    created: str
    updated: str


def _today(value: Optional[str]) -> date:
    if not value:
        return date.today()
    try:
        return date.fromisoformat(value[:10])
    except ValueError as e:
        raise InvalidInputError("Invalid date: use YYYY-MM-DD.") from e


def _response(
    guide: StudyGuide, today: date, include_details: bool = False
) -> StudyGuideResponse:
    sessions = service.sessions_of(guide)
    ids = {a.id for s in sessions for a in s.activities}
    completed = [a for a in guide.completed_activities if a in ids]
    due = service.due_card_ids(guide, today)
    upcoming = [
        s.date
        for s in sessions
        if s.date >= today.isoformat()
        and any(a.id not in completed for a in s.activities)
    ]
    response = StudyGuideResponse(
        id=guide.id or "",
        notebook_id=guide.notebook_id,
        title=guide.title,
        overview=guide.overview,
        goal=guide.goal,
        level=guide.level,
        language=guide.language,
        instructions=guide.instructions,
        focus_topics=guide.focus_topics,
        source_ids=guide.source_ids,
        include_notes=guide.include_notes,
        grounded=guide.grounded,
        coverage_gaps=guide.coverage_gaps,
        start_date=guide.start_date,
        end_date=guide.end_date,
        exam_date=guide.exam_date,
        weekdays=guide.weekdays,
        minutes_per_session=guide.minutes_per_session,
        overloaded=guide.overloaded,
        topic_count=len(guide.topics),
        card_count=len(guide.cards),
        activity_count=len(ids),
        completed_count=len(completed),
        due_card_count=len(due),
        next_session_date=min(upcoming) if upcoming else None,
        created=str(guide.created),
        updated=str(guide.updated),
    )
    if include_details:
        exam = date.fromisoformat(guide.exam_date) if guide.exam_date else None
        cards: List[FlashcardResponse] = []
        for card in guide.get_cards():
            state = CardState(**guide.card_states.get(card.id, {}))
            cards.append(
                FlashcardResponse(
                    id=card.id,
                    topic_id=card.topic_id,
                    front=card.front,
                    back=card.back,
                    state=state.model_dump(),
                    next_intervals=preview_intervals(state, today, exam),
                )
            )
        response.topics = guide.topics
        response.sessions = [s.model_dump() for s in sessions]
        response.cards = cards
        response.due_card_ids = due
        response.completed_activities = completed
        response.topic_confidence = guide.topic_confidence
        response.topic_stats = service.topic_stats(guide)
    return response


@router.get("/study-guides", response_model=List[StudyGuideResponse])
async def list_study_guides(
    notebook_id: Optional[str] = Query(None), today: Optional[str] = Query(None)
):
    """List study guides, optionally only those of one notebook."""
    day = _today(today)
    return [_response(g, day) for g in await StudyGuide.get_by_notebook(notebook_id)]


@router.post("/study-guides", response_model=StudyGuideResponse)
async def create_study_guide(request: StudyGuideCreateRequest):
    """Generate a personalized study guide and its spaced study calendar."""
    if request.model_id:
        await Model.get(request.model_id)  # raises NotFoundError
    guide = await service.create_study_guide(**request.model_dump())
    return _response(guide, _today(request.start_date), include_details=True)


@router.get("/study-guides/{guide_id}", response_model=StudyGuideResponse)
async def get_study_guide(guide_id: str, today: Optional[str] = Query(None)):
    guide = await StudyGuide.get(guide_id)
    return _response(guide, _today(today), include_details=True)


@router.delete("/study-guides/{guide_id}")
async def delete_study_guide(guide_id: str):
    guide = await StudyGuide.get(guide_id)
    await guide.delete()
    return {"message": "Study guide deleted successfully"}


@router.post("/study-guides/{guide_id}/progress", response_model=StudyGuideResponse)
async def update_activity_progress(
    guide_id: str, request: ActivityProgressRequest, today: Optional[str] = Query(None)
):
    """Mark a scheduled activity as done or not done."""
    guide = await StudyGuide.get(guide_id)
    await service.set_activity_done(guide, request.activity_id, request.done)
    return _response(guide, _today(today), include_details=True)


@router.put(
    "/study-guides/{guide_id}/topics/{topic_id}/confidence",
    response_model=StudyGuideResponse,
)
async def update_topic_confidence(
    guide_id: str,
    topic_id: str,
    request: TopicConfidenceRequest,
    today: Optional[str] = Query(None),
):
    """Record how well the learner thinks they know a topic (1-5)."""
    guide = await StudyGuide.get(guide_id)
    await service.set_topic_confidence(guide, topic_id, request.confidence)
    return _response(guide, _today(today), include_details=True)


@router.post(
    "/study-guides/{guide_id}/cards/{card_id}/review",
    response_model=StudyGuideResponse,
)
async def review_flashcard(guide_id: str, card_id: str, request: CardReviewRequest):
    """Grade recall of a flashcard; schedules its next review."""
    guide = await StudyGuide.get(guide_id)
    today = _today(request.today)
    await service.review_flashcard(guide, card_id, request.rating, today)
    return _response(guide, today, include_details=True)


@router.post("/study-guides/{guide_id}/reschedule", response_model=StudyGuideResponse)
async def reschedule_study_guide(guide_id: str, request: RescheduleRequest):
    """Rebuild the calendar from today, keeping completed work and history."""
    guide = await StudyGuide.get(guide_id)
    today = _today(request.today)
    await service.reschedule(
        guide,
        today=today,
        exam_date=request.exam_date,
        end_date=request.end_date,
        weekdays=request.weekdays,
        minutes_per_session=request.minutes_per_session,
    )
    return _response(guide, today, include_details=True)
