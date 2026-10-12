from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from . import models as m
from .db import get_db
from .errors import ApiError
from .security import hash_token

Db = Annotated[Session, Depends(get_db)]


def _unauthenticated() -> ApiError:
    return ApiError(401, "UNAUTHENTICATED", "Your session has ended. Please sign in again.")


def bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthenticated()
    return token


def current_user(db: Db, token: Annotated[str, Depends(bearer_token)]) -> m.Employee:
    session = db.get(m.AuthSession, hash_token(token))
    if not session or session.expires_at <= m.now():
        raise _unauthenticated()
    user = db.get(m.Employee, session.user_id)
    if not user or not user.active:
        raise _unauthenticated()
    return user


def admin_user(user: Annotated[m.Employee, Depends(current_user)]) -> m.Employee:
    if user.org_role != "admin":
        raise ApiError(403, "FORBIDDEN", "Only admins can do that.")
    return user


CurrentUser = Annotated[m.Employee, Depends(current_user)]
AdminUser = Annotated[m.Employee, Depends(admin_user)]
