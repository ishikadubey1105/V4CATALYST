from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select

from .. import models as m
from .. import serializers as ser
from ..config import settings
from ..deps import CurrentUser, Db, bearer_token
from ..errors import ApiError
from ..schemas import LoginReq
from ..security import hash_token, new_token, verify_password
from ..services import log

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginReq, db: Db):
    key = body.username.strip().lower()
    user = db.scalar(select(m.Employee).where(or_(m.Employee.username == key, func.lower(m.Employee.email) == key)))
    if not user:
        log(db, "auth.invalid_user", f'Sign-in attempt with unknown user "{key}"')
        db.commit()
        raise ApiError(401, "INVALID_USER", "Invalid user. This username is not registered.")

    limit = settings.max_failed_logins
    if user.failed_logins >= limit:
        raise ApiError(401, "ACCOUNT_LOCKED", "Account locked after too many failed attempts. Ask an admin to unlock it.")

    if not verify_password(body.password, user.password_hash):
        user.failed_logins += 1
        log(db, "auth.failed", f"Wrong password for {user.username} ({user.failed_logins}/{limit})", actor_id=user.id)
        db.commit()
        left = limit - user.failed_logins
        if left <= 0:
            raise ApiError(401, "ACCOUNT_LOCKED", "Account locked after too many failed attempts. Ask an admin to unlock it.")
        raise ApiError(401, "INVALID_PASSWORD", f"Incorrect password. {left} attempt{'s' if left != 1 else ''} left.")

    if not user.active:
        log(db, "auth.blocked", f"Disabled account {user.username} tried to sign in", actor_id=user.id)
        db.commit()
        raise ApiError(401, "ACCOUNT_DISABLED", "This account has been disabled by an administrator.")

    token = new_token()
    user.failed_logins = 0
    db.add(m.AuthSession(token_hash=hash_token(token), user_id=user.id, expires_at=m.now() + timedelta(hours=settings.session_ttl_hours)))
    log(db, "auth.login", f"{user.name} signed in", actor_id=user.id)
    db.commit()
    return {"token": token, "user": ser.employee(user)}


@router.post("/logout")
def logout(user: CurrentUser, db: Db, token: Annotated[str, Depends(bearer_token)]):
    session = db.get(m.AuthSession, hash_token(token))
    if session:
        db.delete(session)
    log(db, "auth.logout", f"{user.name} signed out", actor_id=user.id)
    db.commit()
    return {"ok": True}
