"""Study summaries with verified quotes and genuine figure crops."""

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from api.models import NoteResponse
from open_notebook.study_summaries import generate_study_summary

router = APIRouter()


class StudySummaryRequest(BaseModel):
    source_id: Optional[str] = Field(None, description="Summarize this source")
    topic: Optional[str] = Field(
        None, max_length=200, description="Or summarize this topic across sources"
    )
    language: Optional[str] = Field(None, max_length=40)
    title: Optional[str] = Field(None, max_length=200)


@router.post("/notebooks/{notebook_id}/study-summaries", response_model=NoteResponse)
async def create_study_summary(notebook_id: str, request: StudySummaryRequest):
    note = await generate_study_summary(
        notebook_id,
        source_id=request.source_id,
        topic=request.topic,
        language=request.language or "the language of the material",
        title=request.title,
    )
    return NoteResponse(
        id=note.id or "",
        title=note.title,
        content=note.content,
        note_type=note.note_type,
        created=str(note.created),
        updated=str(note.updated),
        images=note.images,
    )
