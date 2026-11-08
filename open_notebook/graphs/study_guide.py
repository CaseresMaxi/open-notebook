"""LLM step for study guides: topics and per-strategy study material.

Scheduling is deterministic and lives in `open_notebook/study_planning.py`;
this module only asks the model for the content and validates it.
"""

from typing import Any, Dict, List, Literal, Optional

from ai_prompter import Prompter
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers.pydantic import PydanticOutputParser
from pydantic import BaseModel, Field

from open_notebook.ai.provision import provision_langchain_model
from open_notebook.domain.study_guide import Flashcard, PracticeQuestion, StudyTopic
from open_notebook.exceptions import ExternalServiceError, OpenNotebookError
from open_notebook.graphs.exam import _invoke_structured
from open_notebook.utils.error_classifier import classify_error

GENERATE_MAX_TOKENS = 32000
MAX_TOPICS = 12
MAX_CARDS_PER_TOPIC = 12

GOAL_DESCRIPTIONS = {
    "understand": "understand the subject deeply: explain it, connect ideas and reason with them",
    "memorize": "remember facts, terms and definitions accurately over time",
    "exam": "prepare for an exam: remember and apply the material under test conditions",
    "apply": "apply the ideas to new problems and practical situations",
}
CARDS_PER_TOPIC = {
    "understand": "3 to 5",
    "memorize": "6 to 10",
    "exam": "5 to 8",
    "apply": "3 to 5",
}


class GeneratedPracticeQuestion(BaseModel):
    question: str
    answer: str


class GeneratedFlashcard(BaseModel):
    front: str
    back: str


class GeneratedTopic(BaseModel):
    title: str
    summary: str = ""
    key_ideas: List[str] = Field(default_factory=list)
    prerequisites: List[int] = Field(
        default_factory=list,
        description="0-based indexes of earlier topics that must be learned first",
    )
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    importance: int = Field(2, description="3 core, 2 important, 1 detail")
    source_ids: List[str] = Field(default_factory=list)
    elaboration_questions: List[str] = Field(default_factory=list)
    self_explanation_prompt: str = ""
    concrete_examples: List[str] = Field(default_factory=list)
    dual_coding_task: str = ""
    misconceptions: List[str] = Field(default_factory=list)
    practice_questions: List[GeneratedPracticeQuestion] = Field(default_factory=list)
    flashcards: List[GeneratedFlashcard] = Field(default_factory=list)


class GeneratedGuide(BaseModel):
    title: str
    overview: str = ""
    coverage_gaps: List[str] = Field(default_factory=list)
    topics: List[GeneratedTopic]


def _clean(values: List[str], limit: int) -> List[str]:
    return [v.strip() for v in values if v and v.strip()][:limit]


def validate_generated_guide(
    guide: GeneratedGuide, allowed_source_ids: List[str]
) -> tuple[List[StudyTopic], List[Flashcard]]:
    """Drop empty topics/cards, assign ids and keep only valid references."""
    allowed = set(allowed_source_ids)
    topics: List[StudyTopic] = []
    cards: List[Flashcard] = []
    # Generated index -> assigned topic id, for prerequisite references.
    index_to_id: Dict[int, str] = {}
    for index, raw in enumerate(guide.topics):
        title = raw.title.strip()
        if not title or len(topics) >= MAX_TOPICS:
            continue
        topic_id = f"t{len(topics) + 1}"
        index_to_id[index] = topic_id
        topic = StudyTopic(
            id=topic_id,
            title=title,
            summary=raw.summary.strip(),
            key_ideas=_clean(raw.key_ideas, 8),
            prerequisites=list(
                dict.fromkeys(
                    index_to_id[p]
                    for p in raw.prerequisites
                    if p < index and p in index_to_id
                )
            ),
            difficulty=raw.difficulty,
            importance=min(max(int(raw.importance or 2), 1), 3),
            source_ids=[s for s in dict.fromkeys(raw.source_ids) if s in allowed],
            elaboration_questions=_clean(raw.elaboration_questions, 5),
            self_explanation_prompt=raw.self_explanation_prompt.strip(),
            concrete_examples=_clean(raw.concrete_examples, 4),
            dual_coding_task=raw.dual_coding_task.strip(),
            misconceptions=_clean(raw.misconceptions, 4),
            practice_questions=[
                PracticeQuestion(question=q.question.strip(), answer=q.answer.strip())
                for q in raw.practice_questions
                if q.question.strip() and q.answer.strip()
            ][:6],
        )
        topics.append(topic)
        for card in raw.flashcards[:MAX_CARDS_PER_TOPIC]:
            front, back = card.front.strip(), card.back.strip()
            if front and back:
                cards.append(
                    Flashcard(
                        id=f"c{len(cards) + 1}",
                        topic_id=topic_id,
                        front=front,
                        back=back,
                    )
                )
    return topics, cards


async def generate_study_guide_content(
    material: Optional[str],
    *,
    sources: List[Dict[str, str]],
    goal: str,
    level: str,
    focus_topics: List[str],
    session_count: int,
    minutes_per_session: int,
    days_until_exam: Optional[int],
    language: Optional[str],
    instructions: Optional[str],
    model_id: Optional[str],
) -> tuple[str, str, List[str], List[StudyTopic], List[Flashcard]]:
    """Returns (title, overview, coverage_gaps, topics, cards)."""
    grounded = bool(material)
    try:
        parser: PydanticOutputParser[GeneratedGuide] = PydanticOutputParser(
            pydantic_object=GeneratedGuide
        )
        # User text (topics, instructions) is a render variable, never template
        # source (see docs/7-DEVELOPMENT/security.md).
        system_prompt = Prompter(prompt_template="study/guide", parser=parser).render(  # type: ignore[arg-type]
            data=dict(
                goal_description=GOAL_DESCRIPTIONS.get(goal, goal),
                level=level,
                session_count=session_count,
                minutes_per_session=minutes_per_session,
                total_minutes=session_count * minutes_per_session,
                days_until_exam=days_until_exam,
                language=language,
                focus_topics=focus_topics,
                grounded=grounded,
                sources=sources,
                max_topics=MAX_TOPICS,
                cards_per_topic=CARDS_PER_TOPIC.get(goal, "4 to 6"),
                instructions=instructions,
            )
        )
        human: Any = (
            material if grounded else "Write the study guide for the requested topics."
        )
        payload = [SystemMessage(content=system_prompt), HumanMessage(content=human)]
        model = await provision_langchain_model(
            system_prompt + (material or ""),
            model_id,
            "transformation",
            max_tokens=GENERATE_MAX_TOKENS,
            structured=dict(type="json"),
        )
        guide = await _invoke_structured(model, payload, parser)
    except OpenNotebookError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e

    topics, cards = validate_generated_guide(guide, [s["id"] for s in sources])
    if not topics:
        raise ExternalServiceError(
            "The model did not return any valid topic. Try again, pick a "
            "different model, or check that the selected sources have content."
        )
    return (
        guide.title.strip(),
        guide.overview.strip(),
        _clean(guide.coverage_gaps, 10),
        topics,
        cards,
    )
