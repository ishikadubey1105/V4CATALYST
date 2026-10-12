"""Side effects shared by every route: audit rows, notifications, case timestamps."""
from sqlalchemy.orm import Session

from . import models as m


def log(db: Session, action: str, detail: str, case_id: str | None = None, actor_id: str = "system") -> None:
    db.add(m.AuditEvent(id=m.uid("a"), at=m.now(), actor_id=actor_id, action=action, case_id=case_id, detail=detail))


def notify(db: Session, user_id: str, kind: str, title: str, body: str, link: str) -> None:
    db.add(m.Notification(id=m.uid("nt"), user_id=user_id, kind=kind, title=title, body=body, link=link, at=m.now(), read=False))


def touch(c: m.Case) -> None:
    c.updated_at = m.now()


def name_of(db: Session, emp_id: str | None) -> str:
    e = db.get(m.Employee, emp_id) if emp_id else None
    return e.name if e else "Someone"
