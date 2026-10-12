"""
Handoff assistant, computed locally from the case record (no external AI service, no API key).

- draft: writes the handoff note for the current owner, plus what is urgent, the risks, and gaps to fix first.
- brief: tells the receiver what they are taking on and what to ask the sender before accepting.

Every sentence is built from the case's own notes, decisions, tasks, documents and questions, so the output is
deterministic, never invents facts, works offline, and costs nothing per request at any scale.
"""
from dataclasses import asdict, dataclass, field
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .rules import REASON_LABEL

@dataclass
class AiResult:
    text: str
    urgent: list[str] = field(default_factory=list)
    risks: list[str] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)
    source: str = "local"  # computed on the server from the case record

    def to_json(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


# ---------- Case facts ----------

@dataclass
class CaseFacts:
    case: m.Case
    owner: str
    names: dict[str, str]
    notes: list[m.Note]
    decisions: list[m.Decision]
    docs: list[m.Document]
    open_tasks: list[m.Task]
    done_tasks: list[m.Task]
    open_questions: list[m.Question]
    answered_questions: list[m.Question]


def gather(db: Session, c: m.Case) -> CaseFacts:
    names = {e.id: e.name for e in db.scalars(select(m.Employee))}
    tasks = list(db.scalars(select(m.Task).where(m.Task.case_id == c.id).order_by(m.Task.due.is_(None), m.Task.due)))
    questions = list(db.scalars(select(m.Question).where(m.Question.case_id == c.id).order_by(m.Question.at)))
    return CaseFacts(
        case=c, owner=names.get(c.owner_id, "Unknown"), names=names,
        notes=list(db.scalars(select(m.Note).where(m.Note.case_id == c.id).order_by(m.Note.at))),
        decisions=list(db.scalars(select(m.Decision).where(m.Decision.case_id == c.id).order_by(m.Decision.at))),
        docs=list(db.scalars(select(m.Document).where(m.Document.case_id == c.id).order_by(m.Document.at))),
        open_tasks=[t for t in tasks if not t.done], done_tasks=[t for t in tasks if t.done],
        open_questions=[q for q in questions if not q.answer], answered_questions=[q for q in questions if q.answer],
    )


def _due(t: m.Task) -> str:
    if not t.due:
        return "no deadline"
    delta = t.due - m.now()
    when = t.due.strftime("%d %b")
    if delta.total_seconds() < 0:
        return f"OVERDUE since {when}"
    if delta <= timedelta(hours=48):
        return f"due {when} (within 48h)"
    return f"due {when}"


def _task_line(f: CaseFacts, t: m.Task) -> str:
    return f"{t.title} — {f.names.get(t.owner_id, 'UNASSIGNED') if t.owner_id else 'UNASSIGNED'}, {_due(t)}"


# ---------- Analysis ----------

def _template_lists(f: CaseFacts) -> tuple[list[str], list[str], list[str]]:
    urgent = [_task_line(f, t) for t in f.open_tasks if t.due and t.due - m.now() <= timedelta(hours=48)]
    risks: list[str] = []
    if f.case.priority == "high":
        risks.append("High-priority complaint — delays are visible to the complainant.")
    overdue = [t for t in f.open_tasks if t.due and t.due < m.now()]
    if overdue:
        risks.append(f"{len(overdue)} task(s) already overdue.")
    risks += [f"Open question from {f.names.get(q.by, 'someone')}: {q.text}" for q in f.open_questions]
    gaps: list[str] = []
    gaps += [f"Assign an owner: {t.title}" for t in f.open_tasks if not t.owner_id]
    gaps += [f"Set a deadline: {t.title}" for t in f.open_tasks if not t.due]
    if not f.decisions:
        gaps.append("Record the key decisions taken so far.")
    if not f.docs:
        gaps.append("Attach the supporting documents.")
    return urgent, risks, gaps


def local_draft(f: CaseFacts, to_name: str | None, reason: str | None) -> AiResult:
    c = f.case
    urgent, risks, gaps = _template_lists(f)
    parts = [f"{c.code} — {c.title}. {c.complainant} complained via {c.channel.lower()}; priority {c.priority}, currently in {c.stage}."]
    parts.append(f"Where it stands: {c.summary}")
    if f.decisions:
        parts.append("Decided so far: " + "; ".join(d.title for d in f.decisions) + ".")
    if f.open_tasks:
        parts.append("Still open: " + "; ".join(_task_line(f, t) for t in f.open_tasks[:4]) + ".")
    if urgent:
        parts.append("Do first: " + urgent[0] + ".")
    if reason:
        parts.append(f"Forwarded because: {REASON_LABEL.get(reason, reason).lower()}.")
    if to_name:
        parts.insert(0, f"{to_name.split(' ')[0]}, handing this case over to you.")
    return AiResult(text="\n\n".join(parts), urgent=urgent, risks=risks, gaps=gaps)


def local_brief(f: CaseFacts, h: m.Handoff) -> AiResult:
    c = f.case
    urgent, risks, _ = _template_lists(f)
    sender = f.names.get(h.from_id, "the sender")
    text = (f"You are taking over {c.code} ({c.priority} priority, {c.category.lower()}) from {sender}. "
            f"{len(f.open_tasks)} open task(s), {len(f.open_questions)} unanswered question(s), "
            f"{len(f.decisions)} decision(s) and {len(f.docs)} document(s) on file.")
    asks = [f"Who owns \"{t.title}\" after the handover?" for t in f.open_tasks if t.owner_id == h.from_id][:3]
    asks += [f"Is there anything not written down about: {d.title}?" for d in f.decisions[:1]]
    return AiResult(text=text, urgent=urgent, risks=risks, gaps=asks)


# ---------- Entry points ----------

def draft_handoff(db: Session, c: m.Case, to_id: str | None, reason: str | None, reason_note: str) -> AiResult:
    facts = gather(db, c)
    return local_draft(facts, facts.names.get(to_id) if to_id else None, reason)


def brief_receiver(db: Session, h: m.Handoff) -> AiResult:
    return local_brief(gather(db, db.get(m.Case, h.case_id)), h)
