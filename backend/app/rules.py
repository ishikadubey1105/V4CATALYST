"""
Server-side port of frontend/src/lib/permissions.ts and completeness.ts. The frontend runs the same
checks for UX, but these are the ones that count: never trust the client's result.
"""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .errors import ApiError, forbidden, not_found
from .schemas import SubmitHandoffReq
from .services import log

REASON_LABEL = {
    "leave": "Planned leave / absence",
    "reassignment": "Role change or reassignment",
    "escalation": "Escalation to senior staff",
    "expertise": "Needs specific expertise",
    "workload": "Workload balancing",
    "other": "Other",
}


# ---------- Case relationship (derived per case, never stored on the employee) ----------

def case_role(db: Session, u: m.Employee, c: m.Case) -> str:
    if c.owner_id == u.id:
        return "owner"
    if db.scalar(select(m.Handoff.id).where(m.Handoff.case_id == c.id, m.Handoff.status == "submitted", m.Handoff.to_id == u.id)):
        return "receiver"
    if db.scalar(select(m.Task.id).where(m.Task.case_id == c.id, m.Task.owner_id == u.id, m.Task.done.is_(False))):
        return "assignee"
    if db.scalar(select(m.Ownership.id).where(m.Ownership.case_id == c.id, m.Ownership.user_id == u.id)):
        return "previous_owner"
    if u.org_role in ("admin", "auditor"):
        return u.org_role
    return "none"


def can_view_case(db: Session, u: m.Employee, c: m.Case) -> bool:
    return u.org_role != "employee" or case_role(db, u, c) != "none"


def visible_case_ids(db: Session, u: m.Employee) -> set[str] | None:
    """None means "every case" (admins and auditors). Same rules as case_role, as set queries."""
    if u.org_role != "employee":
        return None
    ids: set[str] = set(db.scalars(select(m.Case.id).where(m.Case.owner_id == u.id)))
    ids |= set(db.scalars(select(m.Handoff.case_id).where(m.Handoff.status == "submitted", m.Handoff.to_id == u.id)))
    ids |= set(db.scalars(select(m.Task.case_id).where(m.Task.owner_id == u.id, m.Task.done.is_(False))))
    ids |= set(db.scalars(select(m.Ownership.case_id).where(m.Ownership.user_id == u.id)))
    return ids


def can_edit_case(u: m.Employee, c: m.Case) -> bool:
    return u.org_role != "auditor" and (u.id == c.owner_id or u.org_role == "admin")


# ---------- Lookups that raise the contract's error codes ----------

def get_case(db: Session, case_id: str) -> m.Case:
    c = db.get(m.Case, case_id)
    if not c:
        raise not_found("Case")
    return c


def require_view(db: Session, u: m.Employee, c: m.Case) -> None:
    """A refused case access is written to the audit log before the 403 goes out."""
    if not can_view_case(db, u, c):
        log(db, "access.denied", f"Tried to open {c.code} without a relationship to it", c.id, u.id)
        db.commit()
        raise forbidden("You are not connected to this case.")


def require_edit(u: m.Employee, c: m.Case, message: str = "Only the case owner or an admin can change this case.") -> None:
    if not can_edit_case(u, c):
        raise forbidden(message)


def require_not_auditor(u: m.Employee) -> None:
    if u.org_role == "auditor":
        raise forbidden("Auditors have read-only access.")


def assignable_employee(db: Session, emp_id: str, field: str = "employee") -> m.Employee:
    """Cases and tasks can only go to active, non-auditor employees."""
    e = db.get(m.Employee, emp_id)
    if not e:
        raise not_found(field.capitalize())
    if not e.active or e.org_role == "auditor":
        raise ApiError(400, "INVALID_ASSIGNEE", f"{e.name} cannot be assigned work.")
    return e


# ---------- Pipeline ----------

def stage_move_blocked(db: Session, c: m.Case, to: str) -> str | None:
    if c.stage == "handoff":
        return "Case is in handoff — it moves on when the receiver accepts or rejects."
    if to == "handoff":
        return 'Use "Forward case" to start a handoff.'
    if to == "resolved" and db.scalar(select(m.Task.id).where(m.Task.case_id == c.id, m.Task.done.is_(False))):
        return "Close all open tasks before resolving."
    return None


# ---------- Completeness gate (8 checks) ----------

@dataclass
class Check:
    id: str
    label: str
    passed: bool
    detail: str


def run_completeness(db: Session, case_id: str, draft: SubmitHandoffReq) -> list[Check]:
    tasks = list(db.scalars(select(m.Task).where(m.Task.case_id == case_id, m.Task.done.is_(False))))
    no_owner = [t for t in tasks if not t.owner_id]
    no_due = [t for t in tasks if not t.due]
    open_q = list(db.scalars(select(m.Question).where(m.Question.case_id == case_id, m.Question.answer.is_(None))))
    n_decisions = len(db.scalars(select(m.Decision.id).where(m.Decision.case_id == case_id)).all())
    n_docs = len(db.scalars(select(m.Document.id).where(m.Document.case_id == case_id)).all())
    summary_len = len(draft.summary.strip())
    reason_ok = bool(draft.reason) and len(draft.reason_note.strip()) >= 10

    return [
        Check("receiver", "Receiving employee selected", bool(draft.to_id), "Choose who the case is forwarded to"),
        Check("reason", "Reason for forwarding given", reason_ok, "Pick a reason and explain it (min. 10 characters)"),
        Check("summary", "Handoff note written", summary_len >= 40, f"Needs at least 40 characters (has {summary_len})"),
        Check("decisions", "Key decisions recorded", n_decisions > 0, f"{n_decisions} decisions logged"),
        Check("documents", "Supporting documents attached", n_docs > 0, f"{n_docs} files attached"),
        Check("owners", "Every open task has an assignee", not no_owner, "Unassigned: " + "; ".join(t.title for t in no_owner)),
        Check("deadlines", "Every open task has a deadline", not no_due, "No deadline: " + "; ".join(t.title for t in no_due)),
        Check("questions", "No unanswered questions", not open_q, f"{len(open_q)} open question(s)"),
    ]


def get_handoff(db: Session, handoff_id: str) -> m.Handoff:
    h = db.get(m.Handoff, handoff_id)
    if not h:
        raise not_found("Handoff")
    return h
