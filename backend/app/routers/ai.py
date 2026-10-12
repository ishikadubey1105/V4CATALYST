from fastapi import APIRouter

from .. import ai
from ..deps import CurrentUser, Db
from ..errors import forbidden
from ..rules import get_case, get_handoff
from ..schemas import AiDraftReq
from ..services import log

router = APIRouter(tags=["ai"])


@router.post("/cases/{case_id}/ai/handoff-draft")
def handoff_draft(case_id: str, body: AiDraftReq, user: CurrentUser, db: Db):
    """Draft the handoff note (plus urgent items, risks, gaps to fix) for the case owner in the forward wizard."""
    c = get_case(db, case_id)
    if c.owner_id != user.id:
        raise forbidden("Only the current owner can draft a handoff for this case.")
    result = ai.draft_handoff(db, c, body.to_id, body.reason, body.reason_note)
    log(db, "ai.handoff_drafted", f"Handoff note drafted ({result.source})", c.id, user.id)
    db.commit()
    return result.to_json()


@router.post("/handoffs/{handoff_id}/ai/brief")
def handoff_brief(handoff_id: str, user: CurrentUser, db: Db):
    """Brief the receiver on what they are taking on and what to ask before accepting."""
    h = get_handoff(db, handoff_id)
    if h.to_id != user.id:
        raise forbidden("Only the receiver can request a briefing on this forward.")
    result = ai.brief_receiver(db, h)
    log(db, "ai.handoff_briefed", f"Receiver briefing generated ({result.source})", h.case_id, user.id)
    db.commit()
    return result.to_json()
