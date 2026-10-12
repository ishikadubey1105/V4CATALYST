from fastapi import APIRouter
from sqlalchemy import delete, func, select

from .. import models as m
from .. import serializers as ser
from ..deps import AdminUser, Db
from ..errors import ApiError, forbidden, not_found
from ..security import hash_password, temp_password
from ..services import log
from ..schemas import CreateEmployeeReq, UpdateEmployeeReq

router = APIRouter(prefix="/employees", tags=["employees"])

TONES = [
    "bg-sky-100 text-sky-900", "bg-amber-100 text-amber-900", "bg-emerald-100 text-emerald-900", "bg-rose-100 text-rose-900",
    "bg-indigo-100 text-indigo-900", "bg-stone-200 text-stone-900", "bg-teal-100 text-teal-900",
]


@router.post("")
def create_employee(body: CreateEmployeeReq, admin: AdminUser, db: Db):
    username, email = body.username.lower(), body.email.lower()
    if db.scalar(select(m.Employee.id).where(m.Employee.username == username)):
        raise ApiError(409, "USERNAME_TAKEN", "That username is already taken.")
    if db.scalar(select(m.Employee.id).where(func.lower(m.Employee.email) == email)):
        raise ApiError(409, "EMAIL_TAKEN", "An employee with this email already exists.")

    count = db.scalar(select(func.count(m.Employee.id))) or 0
    password = temp_password()
    e = m.Employee(
        id=m.uid("e"), username=username, name=body.name, email=email, department=body.department, title=body.title,
        org_role=body.org_role, active=True, tone=TONES[count % len(TONES)], password_hash=hash_password(password),
    )
    db.add(e)
    log(db, "employee.created", f"{e.name} ({e.username}) as {e.org_role}", actor_id=admin.id)
    db.commit()
    # The one-time password is returned once and never stored in plain text.
    return {"employee": ser.employee(e), "tempPassword": password}


@router.patch("/{employee_id}")
def update_employee(employee_id: str, body: UpdateEmployeeReq, admin: AdminUser, db: Db):
    if employee_id == admin.id:
        raise forbidden("You cannot change your own account.")
    e = db.get(m.Employee, employee_id)
    if not e:
        raise not_found("Employee")

    if body.org_role and body.org_role != e.org_role:
        log(db, "employee.role_changed", f"{e.name}: {e.org_role} → {body.org_role}", actor_id=admin.id)
        e.org_role = body.org_role
    if body.active is not None:
        if body.active != e.active:
            log(db, "employee.enabled" if body.active else "employee.disabled", e.name, actor_id=admin.id)
        if body.active and e.failed_logins:
            # Enabling (or "Unlock" in the console, which sends active=true) clears the failed-login lock.
            log(db, "employee.unlocked", f"{e.name}: failed-login lock cleared", actor_id=admin.id)
            e.failed_logins = 0
        if not body.active:
            db.execute(delete(m.AuthSession).where(m.AuthSession.user_id == e.id))  # sign them out everywhere
        e.active = body.active
    if body.department:
        e.department = body.department
    if body.title:
        e.title = body.title
    db.commit()
    return ser.employee(e)
