import re
from pathlib import Path

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from .. import models as m
from .. import serializers as ser
from ..config import settings
from ..deps import CurrentUser, Db
from ..errors import ApiError, bad_request, forbidden, not_found
from ..rules import (
    assignable_employee, can_edit_case, get_case, get_handoff, require_edit, require_not_auditor, require_view,
    stage_move_blocked,
)
from ..schemas import (
    AnswerQuestionReq, AskQuestionReq, CreateCaseReq, CreateDecisionReq, CreateNoteReq, CreateTaskReq, MoveStageReq,
    ReassignReq, UpdateTaskReq,
)
from ..services import log, name_of, notify, touch

router = APIRouter(tags=["cases"])

OK = {"ok": True}


# ---------- Cases ----------

def _next_code(db: Db) -> str:
    numbers = [int(code.split("-")[1]) for code in db.scalars(select(m.Case.code)) if re.fullmatch(r"CMP-\d+", code)]
    return f"CMP-{max(numbers, default=1000) + 1}"


@router.post("/cases")
def create_case(body: CreateCaseReq, user: CurrentUser, db: Db):
    require_not_auditor(user)
    owner = assignable_employee(db, body.owner_id, "owner")
    at = m.now()
    c = m.Case(
        id=m.uid("c"), code=_next_code(db), title=body.title, complainant=body.complainant, channel=body.channel,
        category=body.category, priority=body.priority, summary=body.summary, stage="received", owner_id=owner.id,
        created_by=user.id, received_at=at, updated_at=at,
    )
    db.add(c)
    db.add(m.Ownership(case_id=c.id, user_id=owner.id, from_at=at, via="created"))
    if owner.id != user.id:
        notify(db, owner.id, "assigned", f"New complaint assigned: {c.code}", f'{user.name} registered "{c.title}" and made you owner', f"/cases/{c.id}")
    log(db, "case.created", f"Registered {c.code} from {c.channel}; owner {owner.name}", c.id, user.id)
    db.commit()
    return ser.case(c)


@router.get("/cases/{case_id}")
def get_case_route(case_id: str, user: CurrentUser, db: Db):
    """Not used by the current UI (it reads from /sync) — here so a refused read is logged as access.denied."""
    c = get_case(db, case_id)
    require_view(db, user, c)
    return ser.case(c)


@router.patch("/cases/{case_id}/stage")
def move_stage(case_id: str, body: MoveStageReq, user: CurrentUser, db: Db):
    c = get_case(db, case_id)
    require_edit(user, c, "Only the case owner or an admin can move a case.")
    blocked = stage_move_blocked(db, c, body.stage)
    if blocked:
        raise ApiError(409, "STAGE_BLOCKED", blocked)
    if c.stage != body.stage:
        log(db, "stage.changed", f"{c.stage} → {body.stage}", c.id, user.id)
        c.stage = body.stage
        touch(c)
        db.commit()
    return ser.case(c)


@router.post("/cases/{case_id}/reassign")
def reassign(case_id: str, body: ReassignReq, user: CurrentUser, db: Db):
    if user.org_role != "admin":
        raise forbidden("Only admins can reassign.")
    c = get_case(db, case_id)
    if c.stage == "resolved":
        raise ApiError(409, "STAGE_BLOCKED", "Resolved cases cannot be reassigned.")
    to = assignable_employee(db, body.to_id)
    if to.id == c.owner_id:
        raise bad_request(f"{to.name} already owns this case.")

    at = m.now()
    old_owner = c.owner_id
    for h in db.scalars(select(m.Handoff).where(m.Handoff.case_id == c.id, m.Handoff.status == "submitted")):
        h.status, h.decided_at, h.reject_reason = "rejected", at, "Superseded by admin reassignment"
    for o in db.scalars(select(m.Ownership).where(m.Ownership.case_id == c.id, m.Ownership.to_at.is_(None))):
        o.to_at = at
    db.add(m.Ownership(case_id=c.id, user_id=to.id, from_at=at, via="forced", reason=body.reason))
    if c.stage == "handoff":
        c.stage = c.prev_stage or "investigation"
    c.prev_stage = None
    c.owner_id = to.id
    touch(c)
    notify(db, to.id, "force", f"You now own {c.code}", f"Reassigned by {user.name}: {body.reason}", f"/cases/{c.id}")
    notify(db, old_owner, "force", f"{c.code} was reassigned", f"Reassigned by {user.name}: {body.reason}", f"/cases/{c.id}?tab=history")
    log(db, "handoff.forced", f"{name_of(db, old_owner)} → {to.name}. Reason: {body.reason}", c.id, user.id)
    db.commit()
    return ser.case(c)


# ---------- Tasks ----------

@router.post("/cases/{case_id}/tasks")
def create_task(case_id: str, body: CreateTaskReq, user: CurrentUser, db: Db):
    c = get_case(db, case_id)
    require_edit(user, c)
    t = m.Task(id=m.uid("t"), case_id=c.id, title=body.title, done=False, created_at=m.now())
    db.add(t)
    touch(c)
    log(db, "task.created", t.title, c.id, user.id)
    db.commit()
    return ser.task(t)


@router.patch("/tasks/{task_id}")
def update_task(task_id: str, body: UpdateTaskReq, user: CurrentUser, db: Db):
    t = db.get(m.Task, task_id)
    if not t:
        raise not_found("Task")
    c = get_case(db, t.case_id)
    sent = body.model_fields_set
    only_ticking = sent <= {"done"}
    # Assignees can tick off their own task even when they don't own the case.
    if not can_edit_case(user, c) and not (only_ticking and t.owner_id == user.id and user.org_role != "auditor"):
        raise forbidden()

    parts: list[str] = []
    notify_id: str | None = None  # a newly assigned person (other than the caller) gets a notification
    if "owner_id" in sent:
        new_owner = assignable_employee(db, body.owner_id, "assignee") if body.owner_id else None
        if (new_owner.id if new_owner else None) != t.owner_id:
            parts.append(f"assignee → {new_owner.name if new_owner else 'none'}")
            if new_owner and new_owner.id != user.id:
                notify_id = new_owner.id
        t.owner_id = new_owner.id if new_owner else None
    if "due" in sent:
        parts.append(f"deadline → {body.due.date().isoformat() if body.due else 'none'}")
        if body.due != t.due:
            t.overdue_notified = False  # a new deadline gets its own overdue alert
        t.due = body.due
    if "done" in sent and body.done is not None:
        parts.append("completed" if body.done else "reopened")
        t.done = body.done

    if not parts:
        return ser.task(t)
    if notify_id:
        notify(db, notify_id, "assigned", f"Task assigned on {c.code}", t.title, f"/cases/{c.id}?tab=actions&highlight={t.id}")
    touch(c)
    log(db, "task.updated", f"{t.title}: {', '.join(parts)}", c.id, user.id)
    db.commit()
    return ser.task(t)


# ---------- Context: notes, decisions ----------

@router.post("/cases/{case_id}/notes")
def create_note(case_id: str, body: CreateNoteReq, user: CurrentUser, db: Db):
    c = get_case(db, case_id)
    require_edit(user, c)
    db.add(m.Note(id=m.uid("n"), case_id=c.id, title=body.title, body=body.body, by=user.id, at=m.now()))
    touch(c)
    log(db, "note.added", body.title, c.id, user.id)
    db.commit()
    return OK


@router.post("/cases/{case_id}/decisions")
def create_decision(case_id: str, body: CreateDecisionReq, user: CurrentUser, db: Db):
    c = get_case(db, case_id)
    require_edit(user, c)
    db.add(m.Decision(id=m.uid("d"), case_id=c.id, title=body.title, rationale=body.rationale, by=user.id, at=m.now()))
    touch(c)
    log(db, "decision.added", body.title, c.id, user.id)
    db.commit()
    return OK


# ---------- Documents ----------

def _kind(name: str) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext == "pdf":
        return "pdf"
    if ext in ("doc", "docx", "txt", "md"):
        return "doc"
    if ext in ("xls", "xlsx", "csv"):
        return "sheet"
    if ext in ("png", "jpg", "jpeg", "gif", "webp"):
        return "image"
    return "other"


def _safe_name(name: str) -> str:
    base = Path(name.replace("\\", "/")).name
    return re.sub(r"[^A-Za-z0-9._ -]", "_", base)[:200] or "file"


@router.post("/cases/{case_id}/documents")
async def upload_documents(case_id: str, user: CurrentUser, db: Db, files: list[UploadFile] = File(...)):
    c = get_case(db, case_id)
    require_edit(user, c)
    if not files:
        raise bad_request("No files were sent.")

    folder = Path(settings.upload_dir) / c.id
    folder.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    try:
        for f in files:
            name = _safe_name(f.filename or "file")
            doc_id = m.uid("f")
            path = folder / f"{doc_id}_{name}"
            size = 0
            with path.open("wb") as out:
                written.append(path)
                while chunk := await f.read(1024 * 1024):
                    size += len(chunk)
                    if size > settings.max_upload_bytes:
                        raise ApiError(413, "FILE_TOO_LARGE", f"{name} is larger than 25 MB.")
                    out.write(chunk)
            db.add(m.Document(id=doc_id, case_id=c.id, name=name, kind=_kind(name), size=size, by=user.id, at=m.now(),
                              storage_path=str(path), content_type=f.content_type))
            log(db, "document.uploaded", name, c.id, user.id)
    except Exception:
        db.rollback()
        for p in written:
            p.unlink(missing_ok=True)
        raise
    touch(c)
    db.commit()
    return OK


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: str, user: CurrentUser, db: Db):
    """Extra route (not yet called by the UI): streams an uploaded file to anyone who can see its case."""
    d = db.get(m.Document, doc_id)
    if not d:
        raise not_found("Document")
    require_view(db, user, get_case(db, d.case_id))
    if not d.storage_path or not Path(d.storage_path).is_file():
        raise ApiError(404, "NO_FILE", "This document has no stored file (demo seed data).")
    return FileResponse(d.storage_path, filename=d.name, media_type=d.content_type or "application/octet-stream")


# ---------- Questions ----------

@router.post("/cases/{case_id}/questions")
def ask_question(case_id: str, body: AskQuestionReq, user: CurrentUser, db: Db):
    require_not_auditor(user)
    c = get_case(db, case_id)
    require_view(db, user, c)
    handoff = None
    if body.handoff_id:
        handoff = get_handoff(db, body.handoff_id)
        if handoff.case_id != c.id:
            raise bad_request("That handoff belongs to another case.")
    q = m.Question(id=m.uid("q"), case_id=c.id, handoff_id=handoff.id if handoff else None, by=user.id, text=body.text, at=m.now())
    db.add(q)
    recipient = handoff.from_id if handoff else c.owner_id
    if recipient and recipient != user.id:
        link = f"/handoffs/{handoff.id}" if handoff else f"/cases/{c.id}?tab=context"
        notify(db, recipient, "question", f"New question on {c.code}", f"{user.name}: {body.text}", link)
    log(db, "question.asked", body.text, c.id, user.id)
    db.commit()
    return OK


@router.post("/questions/{question_id}/answer")
def answer_question(question_id: str, body: AnswerQuestionReq, user: CurrentUser, db: Db):
    require_not_auditor(user)
    q = db.get(m.Question, question_id)
    if not q:
        raise not_found("Question")
    require_view(db, user, get_case(db, q.case_id))
    q.answer, q.answered_by = body.answer, user.id
    if q.by != user.id:
        link = f"/handoffs/{q.handoff_id}" if q.handoff_id else f"/cases/{q.case_id}?tab=context"
        notify(db, q.by, "answer", "Your question was answered", body.answer, link)
    log(db, "question.answered", body.answer, q.case_id, user.id)
    db.commit()
    return OK
