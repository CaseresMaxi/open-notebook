from typing import Any, ClassVar, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.base import ObjectModel
from open_notebook.exceptions import DatabaseOperationError

StudyGoal = Literal["understand", "memorize", "exam", "apply"]
StudyLevel = Literal["beginner", "intermediate", "advanced"]


class PracticeQuestion(BaseModel):
    question: str
    answer: str


class StudyTopic(BaseModel):
    """One unit of the plan, with material for each study strategy."""

    id: str
    title: str
    summary: str = ""
    key_ideas: List[str] = Field(default_factory=list)
    prerequisites: List[str] = Field(default_factory=list)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    importance: int = 2
    source_ids: List[str] = Field(default_factory=list)
    # Elaborative interrogation: "why / how" questions about the key ideas.
    elaboration_questions: List[str] = Field(default_factory=list)
    # Self-explanation (Feynman): explain it without notes, then check.
    self_explanation_prompt: str = ""
    concrete_examples: List[str] = Field(default_factory=list)
    # Dual coding: turn the idea into a diagram, timeline or concept map.
    dual_coding_task: str = ""
    misconceptions: List[str] = Field(default_factory=list)
    # Retrieval practice: answer from memory, then reveal.
    practice_questions: List[PracticeQuestion] = Field(default_factory=list)


class Flashcard(BaseModel):
    id: str
    topic_id: str
    front: str
    back: str


class StudyGuide(ObjectModel):
    table_name: ClassVar[str] = "study_guide"
    nullable_fields: ClassVar[set[str]] = {
        "model_id",
        "language",
        "instructions",
        "exam_date",
    }
    notebook_id: str
    title: str
    overview: str = ""
    goal: StudyGoal = "understand"
    level: StudyLevel = "intermediate"
    language: Optional[str] = None
    instructions: Optional[str] = None
    focus_topics: List[str] = Field(default_factory=list)
    source_ids: List[str] = Field(default_factory=list)
    include_notes: bool = False
    # False when the plan was written from the requested topics alone, without
    # any source text: the content then comes from the model's own knowledge.
    grounded: bool = True
    coverage_gaps: List[str] = Field(default_factory=list)
    start_date: str
    end_date: str
    exam_date: Optional[str] = None
    weekdays: List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])
    minutes_per_session: int = 45
    overloaded: bool = False
    topics: List[Dict[str, Any]] = Field(default_factory=list)
    cards: List[Dict[str, Any]] = Field(default_factory=list)
    card_states: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    sessions: List[Dict[str, Any]] = Field(default_factory=list)
    completed_activities: List[str] = Field(default_factory=list)
    topic_confidence: Dict[str, int] = Field(default_factory=dict)
    model_id: Optional[str] = None

    def _prepare_save_data(self) -> Dict[str, Any]:
        data = super()._prepare_save_data()
        data["notebook_id"] = ensure_record_id(data["notebook_id"])
        if data.get("model_id"):
            data["model_id"] = ensure_record_id(data["model_id"])
        return data

    def get_topics(self) -> List[StudyTopic]:
        return [StudyTopic(**t) for t in self.topics]

    def get_cards(self) -> List[Flashcard]:
        return [Flashcard(**c) for c in self.cards]

    @classmethod
    async def get_by_notebook(cls, notebook_id: Optional[str]) -> List["StudyGuide"]:
        try:
            if notebook_id:
                rows = await repo_query(
                    "SELECT * FROM study_guide WHERE notebook_id = $nb ORDER BY created DESC",
                    {"nb": ensure_record_id(notebook_id)},
                )
            else:
                rows = await repo_query(
                    "SELECT * FROM study_guide ORDER BY created DESC"
                )
            return [cls(**row) for row in rows]
        except Exception as e:
            raise DatabaseOperationError(e)
