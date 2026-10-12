from fastapi import APIRouter
from sqlalchemy import select

from .. import models as m
from .. import serializers as ser
from ..deps import CurrentUser, Db
from ..errors import ApiError, bad_request, forbidden
from ..rules import REASON_LABEL, assignable_employee, get_case, get_handoff, run_completeness
from ..schemas import SECTIONS, AckReq, RejectReq, SubmitHandoffReq
from ..services import log, name_of, notify, touch

router = APIRouter(tags=["handoffs"])


def _require_open_receiver(h: m.Handoff, user: m.Employee, message: str = "Only the receiver can act on this forward.") -> None:
    if h.to_id != user.id:
        raise forbidden(message)
    if h.status != "submitted":
        raise ApiError(409, "HANDOFF_CLOSED", f"This forward was already {h.status}.")


@router.post("/cases/{case_id}/handoffs")
def submit_handoff(case_id: str, body: SubmitHandoffReq, user: CurrentUser, db: Db):
    c = get_case(db, case_id)
    if c.owner_id != user.id:
        raise forbidden("Only the current owner can forward this case.")
    if c.stage in ("handoff", "resolved"):
        raise ApiError(409, "STAGE_BLOCKED", f"A case in the {c.stage} stage cannot be forwarded.")

    # Server-side re-check: never trust the client's completeness result.
    checks = run_completeness(db, c.id, body)
    passed = sum(ch.passed for ch in checks)
    if passed < len(checks):
        failing = "; ".join(ch.label for ch in checks if not ch.passed)
        raise ApiError(422, "INCOMPLETE_HANDOFF", f"Handoff is incomplete ({passed}/{len(checks)} checks pass). Missing: {failing}.")

    to = assignable_employee(db, body.to_id, "receiver")
    if to.id == user.id:
        raise bad_request("You cannot forward a case to yourself.")

    h = m.Handoff(
        id=m.uid("h"), case_id=c.id, from_id=c.owner_id, to_id=to.id, reason=body.reason, reason_note=body.reason_note,
        summary=body.summary, status="submitted", created_at=m.now(), acks={s: False for s in SECTIONS},
    )
    db.add(h)
    c.prev_stage, c.stage = c.stage, "handoff"
    touch(c)
    notify(db, to.id, "handoff", "Case forwarded to you",
           f"{user.name} forwarded {c.code} · Reason: {REASON_LABEL[body.reason].lower()}", f"/handoffs/{h.id}")
    score = round(passed / len(checks) * 100)
    log(db, "handoff.submitted", f"Forwarded to {to.name} · {body.reason}: {body.reason_note} · score {score}%", c.id, user.id)
    db.commit()
    return ser.handoff(h)


@router.post("/handoffs/{handoff_id}/acks")
def set_ack(handoff_id: str, body: AckReq, user: CurrentUser, db: Db):
    h = get_handoff(db, handoff_id)
    _require_open_receiver(h, user, "Only the receiver can acknowledge sections.")
    if h.acks.get(body.section) != body.value:
        h.acks = {**h.acks, body.section: body.value}  # reassign so SQLAlchemy sees the JSON change
        log(db, "section.acknowledged" if body.value else "section.unacknowledged", f'Section "{body.section}"', h.case_id, user.id)
        db.commit()
    return ser.handoff(h)


@router.post("/handoffs/{handoff_id}/accept")
def accept_handoff(handoff_id: str, user: CurrentUser, db: Db):
    h = get_handoff(db, handoff_id)
    _require_open_receiver(h, user)
    if not all(h.acks.get(s) for s in SECTIONS):
        raise ApiError(409, "NOT_ACKNOWLEDGED", "Acknowledge every section first.")
    if db.scalar(select(m.Question.id).where(m.Question.case_id == h.case_id, m.Question.answer.is_(None))):
        raise ApiError(409, "OPEN_QUESTIONS", "Open questions must be answered first.")

    c = get_case(db, h.case_id)
    at = m.now()
    h.status, h.decided_at = "accepted", at
    for o in db.scalars(select(m.Ownership).where(m.Ownership.case_id == c.id, m.Ownership.to_at.is_(None))):
        o.to_at = at
    db.add(m.Ownership(case_id=c.id, user_id=h.to_id, from_at=at, via="handoff", reason=f"{REASON_LABEL[h.reason]}: {h.reason_note}"))
    c.owner_id, c.stage, c.prev_stage = h.to_id, c.prev_stage or "investigation", None
    touch(c)
    notify(db, h.from_id, "accepted", "Forward accepted", f"{user.name} now owns {c.code}", f"/cases/{c.id}?tab=history")
    log(db, "handoff.accepted", f"Ownership {name_of(db, h.from_id)} → {user.name}; all 5 sections acknowledged", c.id, user.id)
    db.commit()
    return ser.handoff(h)


@router.post("/handoffs/{handoff_id}/reject")
def reject_handoff(handoff_id: str, body: RejectReq, user: CurrentUser, db: Db):
    h = get_handoff(db, handoff_id)
    _require_open_receiver(h, user)
    c = get_case(db, h.case_id)
    h.status, h.decided_at, h.reject_reason = "rejected", m.now(), body.reason
    c.stage, c.prev_stage = c.prev_stage or "investigation", None
    touch(c)
    notify(db, h.from_id, "rejected", f"Forward of {c.code} rejected", f"{user.name}: {body.reason}", f"/cases/{c.id}/forward?step=2")
    log(db, "handoff.rejected", body.reason, c.id, user.id)
    db.commit()
    return ser.handoff(h)
