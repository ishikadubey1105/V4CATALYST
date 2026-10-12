"""
Row -> JSON shapes matching frontend/src/lib/types.ts. Optional fields that are None are omitted,
mirroring the `field?: T` declarations on the frontend.
"""
from datetime import datetime, timezone

from . import models as m


def iso(dt: datetime | None) -> str | None:
    """Same format as JavaScript's Date.toISOString(): UTC, milliseconds, trailing Z."""
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _clean(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def employee(e: m.Employee) -> dict:
    return {
        "id": e.id, "username": e.username, "name": e.name, "email": e.email, "department": e.department,
        "title": e.title, "orgRole": e.org_role, "active": e.active, "tone": e.tone,
    }


def case(c: m.Case) -> dict:
    return _clean({
        "id": c.id, "code": c.code, "title": c.title, "complainant": c.complainant, "channel": c.channel,
        "category": c.category, "priority": c.priority, "stage": c.stage, "prevStage": c.prev_stage,
        "ownerId": c.owner_id, "createdBy": c.created_by, "summary": c.summary,
        "receivedAt": iso(c.received_at), "updatedAt": iso(c.updated_at),
    })


def note(n: m.Note) -> dict:
    return {"id": n.id, "caseId": n.case_id, "title": n.title, "body": n.body, "by": n.by, "at": iso(n.at)}


def decision(d: m.Decision) -> dict:
    return {"id": d.id, "caseId": d.case_id, "title": d.title, "rationale": d.rationale, "by": d.by, "at": iso(d.at)}


def document(d: m.Document) -> dict:
    return {"id": d.id, "caseId": d.case_id, "name": d.name, "kind": d.kind, "size": d.size, "by": d.by, "at": iso(d.at)}


def task(t: m.Task) -> dict:
    return _clean({"id": t.id, "caseId": t.case_id, "title": t.title, "ownerId": t.owner_id, "due": iso(t.due), "done": t.done})


def question(q: m.Question) -> dict:
    return _clean({
        "id": q.id, "caseId": q.case_id, "handoffId": q.handoff_id, "by": q.by, "text": q.text, "at": iso(q.at),
        "answer": q.answer, "answeredBy": q.answered_by,
    })


def handoff(h: m.Handoff) -> dict:
    return _clean({
        "id": h.id, "caseId": h.case_id, "fromId": h.from_id, "toId": h.to_id, "reason": h.reason,
        "reasonNote": h.reason_note, "summary": h.summary, "status": h.status, "createdAt": iso(h.created_at),
        "decidedAt": iso(h.decided_at), "rejectReason": h.reject_reason, "acks": dict(h.acks),
    })


def ownership(o: m.Ownership) -> dict:
    return _clean({"caseId": o.case_id, "userId": o.user_id, "from": iso(o.from_at), "to": iso(o.to_at), "via": o.via, "reason": o.reason})


def notification(n: m.Notification) -> dict:
    return {"id": n.id, "userId": n.user_id, "kind": n.kind, "title": n.title, "body": n.body, "at": iso(n.at), "read": n.read, "link": n.link}


def audit(a: m.AuditEvent) -> dict:
    return _clean({"id": a.id, "at": iso(a.at), "actorId": a.actor_id, "action": a.action, "caseId": a.case_id, "detail": a.detail})
