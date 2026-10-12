"""Deadline watcher: notify the assignee and case owner once per overdue task (audit: deadline.overdue)."""
import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
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
    db.commit()
    return len(fresh)


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
