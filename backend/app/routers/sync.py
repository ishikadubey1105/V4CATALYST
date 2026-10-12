from fastapi import APIRouter
from sqlalchemy import select

from .. import models as m
from .. import serializers as ser
from ..deps import CurrentUser, Db
from ..rules import visible_case_ids

router = APIRouter(tags=["sync"])


@router.get("/sync")
def sync(user: CurrentUser, db: Db):
    """
    Snapshot of every record the caller may see. Employees get only cases they own, receive, have open
    tasks on, or owned before (plus those cases' child rows); admins and auditors get everything.
    Notifications are always the caller's own.
    """
    visible = visible_case_ids(db, user)

    def rows(model, order):
        q = select(model).order_by(order)
        if visible is not None:
            q = q.where(model.case_id.in_(visible))
        return db.scalars(q).all()

    cases_q = select(m.Case).order_by(m.Case.received_at.desc())
    if visible is not None:
        cases_q = cases_q.where(m.Case.id.in_(visible))

    snapshot = {
        "employees": [ser.employee(e) for e in db.scalars(select(m.Employee).order_by(m.Employee.created_at, m.Employee.id))],
        "cases": [ser.case(c) for c in db.scalars(cases_q)],
        "notes": [ser.note(x) for x in rows(m.Note, m.Note.at)],
        "decisions": [ser.decision(x) for x in rows(m.Decision, m.Decision.at)],
        "docs": [ser.document(x) for x in rows(m.Document, m.Document.at)],
        "tasks": [ser.task(x) for x in rows(m.Task, m.Task.created_at)],
        "questions": [ser.question(x) for x in rows(m.Question, m.Question.at)],
        "handoffs": [ser.handoff(x) for x in rows(m.Handoff, m.Handoff.created_at)],
        "ownership": [ser.ownership(x) for x in rows(m.Ownership, m.Ownership.id)],
        "notifications": [ser.notification(n) for n in db.scalars(select(m.Notification).where(m.Notification.user_id == user.id).order_by(m.Notification.at))],
        "audit": [ser.audit(x) for x in rows(m.AuditEvent, m.AuditEvent.at)],
        # Not in the Snapshot type, but the admin console reads it to show and clear login locks.
        "failedLogins": (
            {e.username: e.failed_logins for e in db.scalars(select(m.Employee).where(m.Employee.failed_logins > 0))}
            if user.org_role == "admin" else {}
        ),
    }
    return snapshot
