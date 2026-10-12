"""
Demo data — the same accounts and cases as frontend/src/data/mock.ts, so both modes behave alike.
Dates are relative to the moment of seeding. Only runs against an empty database.
"""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .schemas import SECTIONS
from .security import hash_password

ACCOUNTS = [
    # id, username, name, department, title, orgRole, tone, password
    ("e1", "asha.rao", "Asha Rao", "Customer Relations", "Senior Associate", "employee", "bg-sky-100 text-sky-900", "Asha@2026"),
    ("e2", "ravi.menon", "Ravi Menon", "Customer Relations", "Associate", "employee", "bg-amber-100 text-amber-900", "Ravi@2026"),
    ("e3", "meera.iyer", "Meera Iyer", "Operations", "Operations Lead", "admin", "bg-emerald-100 text-emerald-900", "Meera@Admin26"),
    ("e4", "arjun.shah", "Arjun Shah", "Risk & Audit", "Risk and Audit Lead", "admin", "bg-stone-200 text-stone-900", "Arjun@Admin26"),
    ("e5", "neha.kulkarni", "Neha Kulkarni", "Compliance", "Compliance Officer", "employee", "bg-rose-100 text-rose-900", "Neha@2026"),
    ("e6", "karan.joshi", "Karan Joshi", "Logistics", "Logistics Coordinator", "employee", "bg-indigo-100 text-indigo-900", "Karan@2026"),
]


def seed(db: Session) -> bool:
    if db.scalar(select(m.Employee.id).limit(1)):
        return False

    now = m.now()
    local_now = datetime.now().astimezone()

    def days_ago(n: float) -> datetime:
        return now - timedelta(days=n)

    def hours_ago(n: float) -> datetime:
        return now - timedelta(hours=n)

    def end_of_day(n: int) -> datetime:
        """Like date-fns endOfDay(addDays(now, n)) — end of that local day."""
        d = local_now + timedelta(days=n)
        return d.replace(hour=23, minute=59, second=59, microsecond=999000)

    for i, (eid, username, name, dept, title, role, tone, pw) in enumerate(ACCOUNTS):
        db.add(m.Employee(id=eid, username=username, name=name, email=f"{username}@corp.local", department=dept, title=title,
                          org_role=role, active=True, tone=tone, password_hash=hash_password(pw),
                          created_at=now - timedelta(days=365) + timedelta(seconds=i)))

    cases = [
        ("c1", "CMP-1042", "Repeated late deliveries to Nimbus Retail stores", "Nimbus Retail (B2B)", "Email", "Delivery", "high", "investigation", None, "e1", "e5", days_ago(21), hours_ago(3),
         "Three Nimbus stores report deliveries arriving 1–2 days late for six weeks. Root cause looks like a routing rule change in the carrier system. Customer has asked for a written remediation plan and a goodwill credit."),
        ("c2", "CMP-1038", "Data access request not fulfilled within 30 days", "Private individual", "Web form", "Privacy", "high", "handoff", "action", "e5", "e5", days_ago(33), hours_ago(6),
         "Customer filed a subject access request; the statutory deadline was missed by 3 days. Records have been collected from 4 of 5 systems. The CRM export is still outstanding."),
        ("c3", "CMP-1031", "Duplicate charge on corporate invoice", "Orbit Cloud Pvt Ltd", "Phone", "Billing", "medium", "action", None, "e1", "e1", days_ago(9), days_ago(1),
         "Invoice INV-77120 charged twice for September. Finance confirmed the duplicate; refund approved and awaiting payment run."),
        ("c4", "CMP-1027", "Goods damaged on arrival — Pune warehouse", "Kaveri Traders", "Branch", "Product quality", "low", "action", None, "e2", "e5", days_ago(50), days_ago(2),
         "Two pallets arrived with crushed packaging. Photos and carrier report collected. Replacement shipped; carrier claim in progress."),
        ("c5", "CMP-1019", "Complaint about staff conduct at Pune branch", "Walk-in customer", "Branch", "Service", "high", "investigation", None, "e5", "e2", days_ago(14), hours_ago(20),
         "Customer reports being refused service and spoken to rudely. CCTV request raised. Branch manager statement pending."),
        ("c6", "CMP-1012", "Refund not received after return", "Online customer", "Social", "Billing", "medium", "resolved", None, "e6", "e6", days_ago(40), days_ago(12),
         "Refund was stuck due to a failed bank transfer. Re-issued and confirmed received by the customer."),
    ]
    for cid, code, title, complainant, channel, cat, prio, stage, prev, owner, by, received, updated, summary in cases:
        db.add(m.Case(id=cid, code=code, title=title, complainant=complainant, channel=channel, category=cat, priority=prio, stage=stage,
                      prev_stage=prev, owner_id=owner, created_by=by, summary=summary, received_at=received, updated_at=updated))
    db.flush()

    for nid, cid, title, body, by, at in [
        ("n1", "c1", "What the customer wants", "A written remediation plan by end of month and a credit for the six affected weeks. Tone has been firm but cooperative.", "e1", days_ago(12)),
        ("n2", "c1", "Key contacts", "Priya Desai (Nimbus regional ops). Carrier contact: dispatch desk at FastRoute.", "e1", days_ago(9)),
        ("n3", "c2", "Systems involved", "Billing, CRM, support desk, marketing platform, call recordings. Only CRM remains.", "e5", days_ago(20)),
        ("n4", "c3", "Refund path", "Refund is via the weekly payment run (Thursdays).", "e1", days_ago(5)),
        ("n5", "c5", "Sensitivity", "HR is aware. Do not share staff names with the complainant.", "e5", days_ago(3)),
    ]:
        db.add(m.Note(id=nid, case_id=cid, title=title, body=body, by=by, at=at))

    for did, cid, title, why, by, at in [
        ("d1", "c1", "Offer a 10% credit on affected invoices", "Approved by Operations; in line with the delivery SLA policy.", "e3", days_ago(10)),
        ("d2", "c1", "Carrier to roll back the routing rule", "Rule change coincides exactly with the start of delays.", "e1", days_ago(6)),
        ("d3", "c2", "Notify the customer of the delay in writing", "Required by policy once the statutory deadline is missed.", "e5", days_ago(8)),
        ("d4", "c3", "Refund in full, no offset", "Error was ours; customer has a clean payment record.", "e1", days_ago(6)),
        ("d5", "c5", "Escalate to HR before replying", "Conduct complaints follow the HR protocol.", "e3", days_ago(2)),
        ("d6", "c4", "Ship replacement before the claim settles", "Long-standing customer; claim is low value.", "e5", days_ago(25)),
    ]:
        db.add(m.Decision(id=did, case_id=cid, title=title, rationale=why, by=by, at=at))

    for fid, cid, name, kind, size, by, at in [
        ("f1", "c1", "Nimbus_complaint_email.pdf", "pdf", 240_000, "e5", days_ago(21)),
        ("f2", "c1", "Delivery_log_6_weeks.xlsx", "sheet", 312_000, "e1", days_ago(11)),
        ("f3", "c1", "Remediation_plan_draft.docx", "doc", 96_000, "e1", days_ago(4)),
        ("f4", "c2", "SAR_request_form.pdf", "pdf", 120_000, "e5", days_ago(33)),
        ("f5", "c2", "Records_collected.xlsx", "sheet", 88_000, "e5", days_ago(3)),
        ("f6", "c3", "INV-77120.pdf", "pdf", 150_000, "e1", days_ago(9)),
        ("f7", "c4", "Damage_photos.png", "image", 3_400_000, "e2", days_ago(48)),
    ]:
        db.add(m.Document(id=fid, case_id=cid, name=name, kind=kind, size=size, by=by, at=at))

    # c1 is deliberately incomplete so the demo forward gets blocked
    for i, (tid, cid, title, owner, due, done) in enumerate([
        ("t1", "c1", "Confirm routing rule rollback with carrier", "e6", end_of_day(2), False),
        ("t2", "c1", "Send remediation plan to Nimbus", None, end_of_day(5), False),
        ("t3", "c1", "Raise credit note for affected invoices", "e1", None, False),
        ("t4", "c1", "Pull six weeks of delivery logs", "e6", end_of_day(-6), True),
        ("t5", "c2", "Export CRM records for the requester", "e5", end_of_day(1), False),
        ("t6", "c2", "Send final response pack", "e5", end_of_day(4), False),
        ("t7", "c3", "Confirm refund in Thursday payment run", "e1", now + timedelta(hours=20), False),
        ("t8", "c3", "Send apology letter", "e2", end_of_day(9), False),
        ("t9", "c5", "Collect branch manager statement", "e5", days_ago(1), False),
        ("t10", "c5", "Obtain CCTV footage", "e6", days_ago(2), False),
        ("t11", "c4", "File carrier damage claim", "e2", end_of_day(6), False),
    ]):
        db.add(m.Task(id=tid, case_id=cid, title=title, owner_id=owner, due=due, done=done, created_at=days_ago(30) + timedelta(seconds=i)))

    db.add(m.Handoff(id="h1", case_id="c2", from_id="e5", to_id="e2", reason="leave", reason_note="Going on planned leave for two weeks from Monday.",
                     status="submitted", created_at=hours_ago(6), acks={s: False for s in SECTIONS},
                     summary="Only the CRM export and the final response pack remain. The requester has been told about the delay. Ticket CRM-4471 tracks the export."))
    db.add(m.Handoff(id="h0", case_id="c4", from_id="e5", to_id="e2", reason="expertise", reason_note="Ravi handles the carrier relationship for Pune.",
                     status="accepted", created_at=days_ago(9), decided_at=days_ago(8), acks={s: True for s in SECTIONS},
                     summary="Replacement shipped; claim remaining."))
    db.flush()

    db.add(m.Question(id="q1", case_id="c1", by="e3", text="Has the carrier confirmed the rollback date in writing?", at=days_ago(1)))
    db.add(m.Question(id="q2", case_id="c2", handoff_id="h1", by="e2", text="Who is the contact in the CRM team for the export?", at=hours_ago(4),
                      answer="Dev in CRM support — ticket CRM-4471 is already open.", answered_by="e5"))

    for cid, user, start, end, via, reason in [
        ("c1", "e5", days_ago(21), days_ago(14), "created", None),
        ("c1", "e1", days_ago(14), None, "handoff", "Workload: Customer Relations owns B2B delivery complaints"),
        ("c2", "e5", days_ago(33), None, "created", None),
        ("c3", "e1", days_ago(9), None, "created", None),
        ("c4", "e5", days_ago(50), days_ago(8), "created", None),
        ("c4", "e2", days_ago(8), None, "handoff", "Expertise: Ravi handles the carrier relationship for Pune."),
        ("c5", "e5", days_ago(14), None, "created", None),
        ("c6", "e6", days_ago(40), None, "created", None),
    ]:
        db.add(m.Ownership(case_id=cid, user_id=user, from_at=start, to_at=end, via=via, reason=reason))

    db.add(m.Notification(id="nt1", user_id="e2", kind="handoff", title="Case forwarded to you", body="Neha Kulkarni forwarded CMP-1038 · Reason: planned leave",
                          at=hours_ago(6), read=False, link="/handoffs/h1"))
    db.add(m.Notification(id="nt2", user_id="e1", kind="question", title="New question on CMP-1042",
                          body="Meera Iyer: Has the carrier confirmed the rollback date in writing?", at=days_ago(1), read=False, link="/cases/c1?tab=context"))

    for aid, at, actor, action, cid, detail in [
        ("a1", days_ago(21), "e5", "case.created", "c1", "Registered CMP-1042 from Email"),
        ("a2", days_ago(14), "e1", "handoff.accepted", "c1", "Ownership Neha Kulkarni → Asha Rao (workload)"),
        ("a3", days_ago(9), "e5", "handoff.submitted", "c4", "Forwarded to Ravi Menon · expertise · score 100%"),
        ("a4", days_ago(8), "e2", "handoff.accepted", "c4", "All 5 sections acknowledged"),
        ("a5", days_ago(10), "e3", "decision.added", "c1", "Offer a 10% credit on affected invoices"),
        ("a6", hours_ago(6), "e5", "handoff.submitted", "c2", "Forwarded to Ravi Menon · leave · score 100%"),
        ("a7", hours_ago(4), "e2", "question.asked", "c2", "Who is the contact in the CRM team for the export?"),
        ("a8", hours_ago(3), "e5", "question.answered", "c2", "Dev in CRM support — ticket CRM-4471 is already open."),
        ("a9", days_ago(12), "e6", "stage.changed", "c6", "action → resolved"),
    ]:
        db.add(m.AuditEvent(id=aid, at=at, actor_id=actor, action=action, case_id=cid, detail=detail))

    db.commit()
    return True
