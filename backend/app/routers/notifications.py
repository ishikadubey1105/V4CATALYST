from fastapi import APIRouter
from sqlalchemy import update

from .. import models as m
from ..deps import CurrentUser, Db
from ..errors import not_found

router = APIRouter(prefix="/notifications", tags=["notifications"])


# Declared before /{notification_id}/read so "read-all" is never taken for an id.
@router.post("/read-all")
def mark_all_read(user: CurrentUser, db: Db):
    db.execute(update(m.Notification).where(m.Notification.user_id == user.id, m.Notification.read.is_(False)).values(read=True))
    db.commit()
    return {"ok": True}


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, user: CurrentUser, db: Db):
    n = db.get(m.Notification, notification_id)
    if not n or n.user_id != user.id:
        raise not_found("Notification")
    n.read = True
    db.commit()
    return {"ok": True}
