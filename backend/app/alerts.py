"""
Alert system: everything that is late or about to be, computed live from the records.

Each employee sees the alerts they can act on (their tasks, cases they own, forwards to or from them, questions
waiting on them); admins and auditors see every alert. Background reminders and escalations live in deadlines.py.
"""
from datetime import timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from . import models as m
from .config import settings
from .serializers import iso

SEVERITY_RANK = {"critical": 0, "high": 1, "warning": 2, "info": 3}


def _hours(delta: timedelta) -> int:
    return int(delta.total_seconds() // 3600)


def _age(hours: int) -> str:
    return f"{hours // 24}d {hours % 24}h" if hours >= 24 else f"{hours}h"


def compute_alerts(db: Session, user: m.Employee) -> list[dict]:
    now = m.now()
    everyone = user.org_role != "employee"
    names = {e.id: e.name for e in db.scalars(select(m.Employee))}
    cases = {c.id: c for c in db.scalars(select(m.Case))}
    alerts: list[dict] = []

    def add(kind, severity, title, detail, c: m.Case, link, at, responsible):
        alerts.append({
            "id": f"{kind}:{link}", "kind": kind, "severity": severity, "title": title, "detail": detail,
            "caseId": c.id, "caseCode": c.code, "link": link, "at": iso(at), "responsibleId": responsible,
        })

    # Tasks: overdue (critical after the escalation window) and due soon
    task_q = select(m.Task).where(m.Task.done.is_(False), m.Task.due.is_not(None),
                                  m.Task.due < now + timedelta(hours=settings.alert_due_soon_hours))
    if not everyone:
        owned = select(m.Case.id).where(m.Case.owner_id == user.id)
        task_q = task_q.where(or_(m.Task.owner_id == user.id, m.Task.case_id.in_(owned)))
    for t in db.scalars(task_q):
        c = cases[t.case_id]
        who = names.get(t.owner_id, "Unassigned") if t.owner_id else "Unassigned"
        link = f"/cases/{c.id}?tab=actions&highlight={t.id}"
        if t.due < now:
            late = _hours(now - t.due)
            severity = "critical" if late >= settings.alert_escalate_after_hours else "high"
            add("task_overdue", severity, f"Overdue {_age(late)}: {t.title}", f"{c.code} · {who}", c, link, t.due, t.owner_id or c.owner_id)
        else:
            add("task_due_soon", "warning", f"Due in {_age(_hours(t.due - now))}: {t.title}", f"{c.code} · {who}", c, link, t.due, t.owner_id or c.owner_id)

    # Forwards waiting for the receiver
    wait = timedelta(hours=settings.alert_handoff_wait_hours)
    h_q = select(m.Handoff).where(m.Handoff.status == "submitted", m.Handoff.created_at < now - wait)
    if not everyone:
        h_q = h_q.where(or_(m.Handoff.to_id == user.id, m.Handoff.from_id == user.id))
    for h in db.scalars(h_q):
        c = cases[h.case_id]
        waited = _hours(now - h.created_at)
        add("handoff_waiting", "high" if waited >= 3 * settings.alert_handoff_wait_hours else "warning",
            f"Forward waiting {_age(waited)} for {names.get(h.to_id, 'receiver')}", f"{c.code} · from {names.get(h.from_id, '?')}",
            c, f"/handoffs/{h.id}", h.created_at, h.to_id)

    # Questions nobody has answered (waiting on the case owner, or the sender for handoff questions)
    q_cut = now - timedelta(hours=settings.alert_question_wait_hours)
    handoffs = {h.id: h for h in db.scalars(select(m.Handoff))}
    for q in db.scalars(select(m.Question).where(m.Question.answer.is_(None), m.Question.at < q_cut)):
        c = cases[q.case_id]
        recipient = handoffs[q.handoff_id].from_id if q.handoff_id and q.handoff_id in handoffs else c.owner_id
        if not everyone and recipient != user.id:
            continue
        link = f"/handoffs/{q.handoff_id}" if q.handoff_id else f"/cases/{c.id}?tab=context"
        add("question_unanswered", "warning", f"Unanswered {_age(_hours(now - q.at))}: {q.text}",
            f"{c.code} · asked by {names.get(q.by, '?')}", c, link, q.at, recipient)

    # Open cases with no activity
    stale_cut = now - timedelta(days=settings.alert_stale_case_days)
    for c in cases.values():
        if c.stage == "resolved" or c.updated_at >= stale_cut or (not everyone and c.owner_id != user.id):
            continue
        add("case_stale", "info", f"No activity for {(now - c.updated_at).days} days: {c.title}",
            f"{c.code} · owner {names.get(c.owner_id, '?')}", c, f"/cases/{c.id}", c.updated_at, c.owner_id)

    alerts.sort(key=lambda a: (SEVERITY_RANK[a["severity"]], a["at"]))
    return alerts


def summarize(alerts: list[dict]) -> dict:
    counts = {s: 0 for s in SEVERITY_RANK}
    for a in alerts:
        counts[a["severity"]] += 1
    return counts
