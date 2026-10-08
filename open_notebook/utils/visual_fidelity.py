"""Structured visual briefs and source evidence shared with saved artifacts."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

VisualBasis = Literal["adaptation", "conceptual", "illustrative"]


class VisualSourceReference(BaseModel):
    source_id: str = Field(min_length=1, max_length=255)
    source_title: str = Field(default="", max_length=255)
    page: int | None = Field(default=None, ge=1)
    quote: str = Field(default="", max_length=2000)
    observation: str = Field(min_length=20, max_length=2000)


class VisualPlan(BaseModel):
    basis: VisualBasis
    purpose: str = Field(min_length=10, max_length=1500)
    references: list[VisualSourceReference] = Field(default_factory=list, max_length=4)
    preserve: list[str] = Field(min_length=1, max_length=8)
    changes: list[str] = Field(min_length=1, max_length=8)
    checks: list[str] = Field(min_length=2, max_length=10)

    @field_validator("preserve", "changes", "checks")
    @classmethod
    def bounded_details(cls, values: list[str]) -> list[str]:
        if any(not 5 <= len(value.strip()) <= 1000 for value in values):
            raise ValueError("Visual brief details must contain 5 to 1000 characters.")
        return values
