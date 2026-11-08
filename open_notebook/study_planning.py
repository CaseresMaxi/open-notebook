"""Deterministic study planning: spaced sessions and flashcard scheduling.

The model decides *what* to study (topics, questions, flashcards); this module
decides *when*, so the calendar follows the evidence instead of the model's
guesses (see ADR-033):

- Distributed practice: every topic is reviewed again at expanding gaps
  (1, 3, 7, 14, 30... days). Cepeda et al. (2008) found the best gap grows
  with how long the knowledge must last, and that a gap that is too short
  hurts more than one that is too long.
- Retrieval practice: reviews are recall from memory (questions, flashcards,
  mock exams), not rereading.
- Interleaving: when a session reviews several topics, they are mixed in one
  practice block instead of reviewed one after another.
- Pretesting: the first session opens with an attempt to answer before
  studying.
- Successive relearning: flashcards follow an SM-2 style schedule; a card
  answered "again" comes back the same day until it is recalled.

Everything here is pure and synchronous so it can be unit-tested.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, Iterable, List, Literal, Optional, Sequence

from pydantic import BaseModel, Field

ActivityType = Literal[
    "pretest",
    "learn",
    "self_explain",
    "retrieval",
    "interleaved_practice",
    "flashcards",
    "practice_exam",
]
Rating = Literal["again", "hard", "good", "easy"]

# Gaps in days between successive reviews of a topic.
REVIEW_GAPS = (1, 3, 7, 14, 30, 60)
LEARN_MINUTES = {"easy": 20, "medium": 30, "hard": 45}
SELF_EXPLAIN_MINUTES = 10
REVIEW_MINUTES_PER_TOPIC = 8
MAX_INTERLEAVED_MINUTES = 30
FLASHCARD_MINUTES = 10
PRETEST_MINUTES = 10
PRACTICE_EXAM_MINUTES = 40
# Reviews may stretch a session this far beyond its budget before moving on.
REVIEW_OVERFLOW = 1.25
# A review that cannot be placed within this many days of its target is dropped.
MAX_REVIEW_SLIP_DAYS = 3
MAX_PLAN_DAYS = 365
# Recently learned topics on a session day get a flashcards block from then on.
NEW_CARDS_PER_DAY = 20
DEFAULT_EASE = 2.5
MIN_EASE = 1.3
RETRIEVAL_TYPES = {"retrieval", "interleaved_practice", "practice_exam"}


class PlannedTopic(BaseModel):
    """What the scheduler needs to know about a topic."""

    id: str
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    prerequisites: List[str] = Field(default_factory=list)


class StudyActivity(BaseModel):
    id: str
    type: ActivityType
    topic_ids: List[str] = Field(default_factory=list)
    minutes: int


class StudySession(BaseModel):
    id: str
    date: str
    minutes: int
    activities: List[StudyActivity]


class TopicHistory(BaseModel):
    """What already happened to a topic, for rescheduling."""

    learned_on: Optional[date] = None
    last_review_on: Optional[date] = None
    reviews_done: int = 0
    confidence: Optional[int] = None


class PlanResult(BaseModel):
    sessions: List[StudySession]
    overloaded: bool = False


def order_topics(topics: Sequence[PlannedTopic]) -> List[PlannedTopic]:
    """Stable topological order: a topic comes after its prerequisites."""
    by_id = {t.id: t for t in topics}
    ordered: List[PlannedTopic] = []
    placed: set[str] = set()
    visiting: set[str] = set()

    def visit(topic: PlannedTopic) -> None:
        if topic.id in placed or topic.id in visiting:
            return  # already placed, or a cycle: keep the original order
        visiting.add(topic.id)
        for prerequisite in topic.prerequisites:
            if prerequisite in by_id:
                visit(by_id[prerequisite])
        visiting.discard(topic.id)
        placed.add(topic.id)
        ordered.append(topic)

    for topic in topics:
        visit(topic)
    return ordered


def study_days(
    start: date, end: date, weekdays: Iterable[int], skip_end: bool
) -> List[date]:
    """Available days from `start` to `end` (the exam day itself excluded)."""
    allowed = set(weekdays)
    last = end - timedelta(days=1) if skip_end else end
    days: List[date] = []
    current = start
    while current <= last and len(days) < MAX_PLAN_DAYS:
        if current.weekday() in allowed:
            days.append(current)
        current += timedelta(days=1)
    return days


def review_gaps(confidence: Optional[int]) -> List[int]:
    """Low confidence shortens the gaps, high confidence lengthens them."""
    factor = {1: 0.5, 2: 0.7, 4: 1.25, 5: 1.5}.get(confidence or 3, 1.0)
    return [max(1, round(gap * factor)) for gap in REVIEW_GAPS]


def _activity_id(day: date, kind: str, topic_ids: Sequence[str]) -> str:
    # Stable ids: rescheduling keeps the completion of an identical activity.
    return f"{day.isoformat()}:{kind}:{'+'.join(topic_ids) or 'all'}"


class _Durations:
    """Block lengths; short sessions get shorter fixed blocks."""

    def __init__(self, budget: int) -> None:
        short = budget < 40
        self.self_explain = 5 if short else SELF_EXPLAIN_MINUTES
        self.review = 5 if short else REVIEW_MINUTES_PER_TOPIC
        self.max_review = min(MAX_INTERLEAVED_MINUTES, budget)
        self.flashcards = 5 if short else FLASHCARD_MINUTES
        self.pretest = 5 if short else PRETEST_MINUTES
        self.practice_exam = min(PRACTICE_EXAM_MINUTES, max(budget, 15))


class _Day:
    def __init__(self, day: date, budget: int) -> None:
        self.day = day
        self.budget = budget
        self.d = _Durations(budget)
        self.learn: List[tuple[str, int]] = []
        self.reviews: List[str] = []
        self.flashcards = False
        self.pretest: List[str] = []
        self.practice_exam: Optional[List[str]] = None

    @property
    def used(self) -> int:
        d = self.d
        minutes = sum(m + d.self_explain for _, m in self.learn)
        minutes += self.review_minutes
        minutes += d.flashcards if self.flashcards else 0
        minutes += d.pretest if self.pretest else 0
        minutes += d.practice_exam if self.practice_exam is not None else 0
        return minutes

    @property
    def review_minutes(self) -> int:
        return min(len(self.reviews) * self.d.review, self.d.max_review)

    def to_session(self) -> Optional[StudySession]:
        day = self.day
        activities: List[StudyActivity] = []
        if self.pretest:
            activities.append(
                StudyActivity(
                    id=_activity_id(day, "pretest", self.pretest),
                    type="pretest",
                    topic_ids=self.pretest,
                    minutes=self.d.pretest,
                )
            )
        if self.reviews:
            # Review first: recalling yesterday's topics before new material is
            # the spaced retrieval itself, and doubles as a warm-up.
            kind = "interleaved_practice" if len(self.reviews) > 1 else "retrieval"
            activities.append(
                StudyActivity(
                    id=_activity_id(day, kind, self.reviews),
                    type=kind,
                    topic_ids=list(self.reviews),
                    minutes=self.review_minutes,
                )
            )
        for topic_id, minutes in self.learn:
            activities.append(
                StudyActivity(
                    id=_activity_id(day, "learn", [topic_id]),
                    type="learn",
                    topic_ids=[topic_id],
                    minutes=minutes,
                )
            )
            activities.append(
                StudyActivity(
                    id=_activity_id(day, "self_explain", [topic_id]),
                    type="self_explain",
                    topic_ids=[topic_id],
                    minutes=self.d.self_explain,
                )
            )
        if self.practice_exam is not None:
            activities.append(
                StudyActivity(
                    id=_activity_id(day, "practice_exam", self.practice_exam),
                    type="practice_exam",
                    topic_ids=self.practice_exam,
                    minutes=self.d.practice_exam,
                )
            )
        if self.flashcards:
            activities.append(
                StudyActivity(
                    id=_activity_id(day, "flashcards", []),
                    type="flashcards",
                    topic_ids=[],
                    minutes=self.d.flashcards,
                )
            )
        if not activities:
            return None
        return StudySession(
            id=day.isoformat(),
            date=day.isoformat(),
            minutes=sum(a.minutes for a in activities),
            activities=activities,
        )


def build_schedule(
    topics: Sequence[PlannedTopic],
    *,
    start: date,
    end: date,
    weekdays: Iterable[int],
    minutes_per_session: int,
    exam_date: Optional[date] = None,
    history: Optional[Dict[str, TopicHistory]] = None,
    pretest: bool = True,
) -> PlanResult:
    """Lay out sessions from `start` to `end` for the given topics.

    `history` marks topics that were already learned (for rescheduling): they
    only get the reviews still pending, counted from their last review.
    """
    history = history or {}
    days = [
        _Day(d, minutes_per_session)
        for d in study_days(start, end, weekdays, skip_end=exam_date == end)
    ]
    if not days:
        return PlanResult(sessions=[], overloaded=bool(topics))

    ordered = order_topics(topics)
    # Index in `days` of the session where each topic is learned (-1: before
    # this plan started, when rescheduling).
    learned_index: Dict[str, int] = {}
    overloaded = False
    # Leave the final study day before an exam for the mock exam and reviews.
    last_learn_day = len(days) - 2 if exam_date and len(days) > 2 else len(days) - 1

    def place_review(topic_id: str, target: date) -> Optional[int]:
        for i, slot in enumerate(days):
            if slot.day < target:
                continue
            if (slot.day - target).days > MAX_REVIEW_SLIP_DAYS:
                break
            if topic_id in slot.reviews or any(t == topic_id for t, _ in slot.learn):
                return i
            if slot.used + slot.d.review <= slot.budget * REVIEW_OVERFLOW:
                slot.reviews.append(topic_id)
                return i
        return None

    def schedule_reviews(
        topic_id: str, base: date, done: int, confidence: Optional[int]
    ) -> None:
        current = base
        for gap in review_gaps(confidence)[done:]:
            placed = place_review(topic_id, max(current + timedelta(days=gap), start))
            if placed is None:
                break
            current = days[placed].day

    # Topics already learned keep their history: only pending reviews remain.
    pending: List[PlannedTopic] = []
    for topic in ordered:
        past = history.get(topic.id)
        if past and past.learned_on:
            learned_index[topic.id] = -1
            base = past.last_review_on or past.learned_on
            schedule_reviews(topic.id, base, past.reviews_done, past.confidence)
        else:
            pending.append(topic)

    if pretest and pending and not history:
        # Trying to answer before studying primes what to look for.
        days[0].pretest = [t.id for t in pending[:5]]

    # Reserve the daily flashcards block up front so learning fits around it;
    # it is removed again from the days before anything was learned.
    for slot in days if history else days[1:]:
        slot.flashcards = True

    explain = _Durations(minutes_per_session).self_explain
    cursor = 0
    for topic in pending:
        wanted = LEARN_MINUTES[topic.difficulty]
        cost = min(wanted, max(10, minutes_per_session - explain)) + explain
        prereq_day = max(
            (learned_index.get(p, -1) for p in topic.prerequisites), default=-1
        )
        chosen: Optional[int] = None
        for i in range(max(cursor, prereq_day, 0), last_learn_day + 1):
            slot = days[i]
            fits = slot.used + cost <= slot.budget
            # A session takes its first topic if a 10-minute block fits.
            short_fit = slot.used + 10 + explain <= slot.budget
            if fits or (not slot.learn and short_fit):
                chosen = i
                break
        if chosen is None:
            # Not enough time: spread the rest over the least busy sessions.
            overloaded = True
            first = min(max(cursor, prereq_day, 0), last_learn_day)
            chosen = min(range(first, last_learn_day + 1), key=lambda i: days[i].used)
        slot = days[chosen]
        # Shorten the block to what is left of the session (at least 10 min).
        room = slot.budget - slot.used - explain
        minutes = max(10, min(wanted, room))
        slot.learn.append((topic.id, minutes))
        learned_index[topic.id] = chosen
        cursor = chosen
        past = history.get(topic.id)
        schedule_reviews(
            topic.id, days[chosen].day, 0, past.confidence if past else None
        )

    # Flashcards only once something has been learned on an earlier day.
    first_learn = min(learned_index.values(), default=len(days))
    for slot in days[: first_learn + 1]:
        slot.flashcards = first_learn < 0

    all_topics = [t.id for t in ordered]
    if len(days) > 1:
        days[-1].practice_exam = all_topics
    # A cumulative mock exam each week keeps retrieval practice going.
    for i in range(7, len(days) - 1, 7):
        covered = {t for t, li in learned_index.items() if li < i}
        if len(covered) >= 2:
            days[i].practice_exam = [t for t in all_topics if t in covered]

    sessions = [s for s in (d.to_session() for d in days) if s is not None]
    return PlanResult(sessions=sessions, overloaded=overloaded)


def history_from_sessions(
    sessions: Sequence[StudySession],
    completed: Iterable[str],
    confidence: Dict[str, int],
    before: date,
) -> Dict[str, TopicHistory]:
    """Rebuild each topic's learning history from completed past activities."""
    done = set(completed)
    history: Dict[str, TopicHistory] = {}
    for session in sorted(sessions, key=lambda s: s.date):
        day = date.fromisoformat(session.date)
        if day >= before:
            continue
        for activity in session.activities:
            if activity.id not in done:
                continue
            for topic_id in activity.topic_ids:
                entry = history.setdefault(topic_id, TopicHistory())
                if activity.type == "learn":
                    entry.learned_on = entry.learned_on or day
                elif activity.type in RETRIEVAL_TYPES and entry.learned_on:
                    entry.reviews_done += 1
                    entry.last_review_on = day
    for topic_id, value in confidence.items():
        history.setdefault(topic_id, TopicHistory()).confidence = value
    return history


# --- Flashcards -----------------------------------------------------------


class CardState(BaseModel):
    ease: float = DEFAULT_EASE
    interval: int = 0
    repetitions: int = 0
    lapses: int = 0
    due: Optional[str] = None  # ISO date; None = not studied yet
    last_rating: Optional[Rating] = None
    reviews: int = 0
    correct: int = 0


def review_card(
    state: CardState,
    rating: Rating,
    today: date,
    exam_date: Optional[date] = None,
) -> CardState:
    """SM-2 style update. "again" keeps the card due today (relearn it now)."""
    new = state.model_copy()
    new.reviews += 1
    new.last_rating = rating
    if rating == "again":
        new.repetitions = 0
        new.lapses += 1
        new.interval = 0
        new.ease = max(MIN_EASE, new.ease - 0.2)
        new.due = today.isoformat()
        return new

    new.correct += 1
    if rating == "hard":
        interval = 1 if new.repetitions == 0 else max(1, round(new.interval * 1.2))
        new.ease = max(MIN_EASE, new.ease - 0.15)
    elif rating == "good":
        interval = (
            1
            if new.repetitions == 0
            else 3
            if new.repetitions == 1
            else round(new.interval * new.ease)
        )
    else:
        interval = 3 if new.repetitions == 0 else round(new.interval * new.ease * 1.3)
        new.ease += 0.15
    new.repetitions += 1
    new.interval = max(1, interval)
    due = today + timedelta(days=new.interval)
    # Never schedule the next review after the exam: see the card once more first.
    if exam_date and due >= exam_date and exam_date - timedelta(days=1) > today:
        due = exam_date - timedelta(days=1)
    new.due = due.isoformat()
    return new


def preview_intervals(
    state: CardState, today: date, exam_date: Optional[date] = None
) -> Dict[str, int]:
    """Days until the next review for each possible rating."""
    result: Dict[str, int] = {}
    for rating in ("again", "hard", "good", "easy"):
        nxt = review_card(state, rating, today, exam_date)  # type: ignore[arg-type]
        result[rating] = (date.fromisoformat(nxt.due or today.isoformat()) - today).days
    return result


def is_due(state: CardState, today: date) -> bool:
    return state.due is not None and date.fromisoformat(state.due) <= today


def is_mastered(state: CardState) -> bool:
    return state.repetitions >= 2 and state.last_rating in ("good", "easy")


def card_states(raw: Dict[str, Any]) -> Dict[str, CardState]:
    return {key: CardState(**value) for key, value in raw.items()}
