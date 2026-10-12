"""Request DTOs — one per *Req interface in frontend/src/api/contracts.ts. JSON keys are camelCase."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

OrgRole = Literal["employee", "admin", "auditor"]
Stage = Literal["received", "investigation", "action", "handoff", "resolved"]
Priority = Literal["high", "medium", "low"]
Channel = Literal["Email", "Phone", "Web form", "Branch", "Social"]
SectionKey = Literal["overview", "context", "documents", "actions", "questions"]
HandoffReason = Literal["leave", "reassignment", "escalation", "expertise", "workload", "other"]

SECTIONS: tuple[str, ...] = ("overview", "context", "documents", "actions", "questions")


class Dto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True)


class LoginReq(Dto):
    username: str
    password: str = Field(json_schema_extra={"format": "password"})


class CreateCaseReq(Dto):
    # Same minimums as the Register complaint form (CasesList.tsx)
    title: str = Field(min_length=5, max_length=300)
    complainant: str = Field(min_length=1, max_length=200)
    channel: Channel
    category: str = Field(min_length=1, max_length=80)
    priority: Priority
    summary: str = Field(min_length=20)
    owner_id: str


class MoveStageReq(Dto):
    stage: Stage


class ReassignReq(Dto):
    to_id: str
    reason: str = Field(min_length=1)


class CreateTaskReq(Dto):
    title: str = Field(min_length=1, max_length=300)


class UpdateTaskReq(Dto):
    """Each field is optional; sending `null` for ownerId / due clears it (use model_fields_set)."""

    owner_id: str | None = None
    due: datetime | None = None
    done: bool | None = None


class CreateNoteReq(Dto):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)


class CreateDecisionReq(Dto):
    title: str = Field(min_length=1, max_length=300)
    rationale: str = Field(min_length=1)


class AskQuestionReq(Dto):
    text: str = Field(min_length=1)
    handoff_id: str | None = None


class AnswerQuestionReq(Dto):
    answer: str = Field(min_length=1)


class SubmitHandoffReq(Dto):
    to_id: str | None = None
    reason: HandoffReason | None = None
    reason_note: str = ""
    summary: str = ""


class AckReq(Dto):
    section: SectionKey
    value: bool


class RejectReq(Dto):
    reason: str = Field(min_length=1)


class CreateEmployeeReq(Dto):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-z0-9._-]+$")
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=200, pattern=r"^[^@\s]+@[^@\s]+$")
    department: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=120)
    org_role: OrgRole


class UpdateEmployeeReq(Dto):
    org_role: OrgRole | None = None
    active: bool | None = None
    department: str | None = Field(default=None, min_length=1, max_length=120)
    title: str | None = Field(default=None, min_length=1, max_length=120)
