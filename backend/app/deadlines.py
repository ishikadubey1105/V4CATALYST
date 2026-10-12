"""
Deadline watcher (runs every DEADLINE_INTERVAL_SECONDS): overdue notices to the assignee and case owner, due-soon
reminders, escalation of long-overdue tasks to admins, and reminders for forwards nobody has reviewed.
Each fires once per deadline / forward.
"""
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .config import local_tz, settings
from .db import SessionLocal
from .services import log, notify

logger = logging.getLogger("baton.deadlines")


def run_deadline_watcher(db: Session) -> int:
    fresh = db.scalars(
        select(m.Task).where(m.Task.done.is_(False), m.Task.due.is_not(None), m.Task.due < m.now(), m.Task.overdue_notified.is_(False))
    ).all()
    for t in fresh:
        c = db.get(m.Case, t.case_id)
        recipients = {uid for uid in (t.owner_id, c.owner_id if c else None) if uid}
        for user_id in recipients:
            notify(db, user_id, "overdue", f"Overdue: {t.title}", f"{c.code} · {c.title}" if c else "",
                   f"/cases/{t.case_id}?tab=actions&highlight={t.id}")
        t.overdue_notified = True
        log(db, "deadline.overdue", t.title, t.case_id)
    _due_soon_reminders(db)
    _escalate_overdue(db)
    _remind_waiting_handoffs(db)
    db.commit()
    return len(fresh)


def _due_soon_reminders(db: Session) -> None:
    """Remind the assignee once, shortly before the deadline."""
    now = m.now()
    soon = now + timedelta(hours=settings.alert_due_soon_hours)
    for t in db.scalars(select(m.Task).where(m.Task.done.is_(False), m.Task.owner_id.is_not(None), m.Task.due >= now,
                                             m.Task.due < soon, m.Task.due_soon_notified.is_(False))):
        c = db.get(m.Case, t.case_id)
        notify(db, t.owner_id, "reminder", f"Due soon: {t.title}", f"{c.code} · due {t.due.astimezone(local_tz()):%d %b %H:%M %Z}",
               f"/cases/{t.case_id}?tab=actions&highlight={t.id}")
        t.due_soon_notified = True


def _escalate_overdue(db: Session) -> None:
    """Overdue past the escalation window: every active admin is told, once per deadline."""
    cutoff = m.now() - timedelta(hours=settings.alert_escalate_after_hours)
    late = db.scalars(select(m.Task).where(m.Task.done.is_(False), m.Task.due < cutoff, m.Task.escalated.is_(False))).all()
    if not late:
        return
    admins = db.scalars(select(m.Employee.id).where(m.Employee.org_role == "admin", m.Employee.active.is_(True))).all()
    for t in late:
        c = db.get(m.Case, t.case_id)
        who = db.get(m.Employee, t.owner_id).name if t.owner_id else "nobody"
        for admin_id in admins:
            notify(db, admin_id, "escalation", f"Escalated: {t.title}",
                   f"{c.code} · overdue more than {settings.alert_escalate_after_hours}h · assigned to {who}",
                   f"/cases/{t.case_id}?tab=actions&highlight={t.id}")
        t.escalated = True
        log(db, "deadline.escalated", f"{t.title} (assigned to {who}) escalated to admins", t.case_id)


def _remind_waiting_handoffs(db: Session) -> None:
    """A forward nobody has acted on: remind the receiver once."""
    cutoff = m.now() - timedelta(hours=settings.alert_handoff_wait_hours)
    for h in db.scalars(select(m.Handoff).where(m.Handoff.status == "submitted", m.Handoff.created_at < cutoff,
                                                m.Handoff.reminded.is_(False))):
        c = db.get(m.Case, h.case_id)
        notify(db, h.to_id, "reminder", f"Waiting for you: {c.code}",
               f"A forwarded case has waited more than {settings.alert_handoff_wait_hours}h for your review", f"/handoffs/{h.id}")
        h.reminded = True


async def deadline_loop(interval_seconds: int) -> None:
    while True:
        try:
            with SessionLocal() as db:
                n = await asyncio.to_thread(run_deadline_watcher, db)
            if n:
                logger.info("deadline watcher: %d task(s) became overdue", n)
        except Exception:  # keep the loop alive; the next tick retries
            logger.exception("deadline watcher failed")
        await asyncio.sleep(interval_seconds)
