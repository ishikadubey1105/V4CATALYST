"""
Optional demo history for the monthly / yearly reports: `python manage.py seed-history`.

Adds complaints, forwards, tasks (some missing their deadline) and the matching audit events over the past
21 months (so the current and previous year both have data); cases older than 45 days are all closed. Deterministic (fixed random seed) and refuses to run twice (history rows have ids starting with "ch").
"""
import random
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .schemas import SECTIONS

TITLES = {
    "Delivery": ["Late delivery to {c}", "Wrong address on shipment for {c}", "Missing items in delivery to {c}"],
    "Billing": ["Double charge on invoice for {c}", "Refund delayed for {c}", "Incorrect tax on bill for {c}"],
    "Product quality": ["Damaged goods received by {c}", "Faulty unit reported by {c}", "Packaging defect raised by {c}"],
    "Service": ["Rude staff experience reported by {c}", "Long call-centre wait for {c}", "Callback never made to {c}"],
    "Privacy": ["Data access request from {c}", "Marketing emails after opt-out for {c}"],
    "Other": ["General complaint from {c}"],
}
CATEGORY_WEIGHTS = {"Delivery": 5, "Billing": 4, "Product quality": 3, "Service": 3, "Privacy": 1, "Other": 1}
COMPLAINANTS = ["Orbit Cloud Pvt Ltd", "Kaveri Traders", "Nimbus Retail (B2B)", "Online customer", "Walk-in customer",
                "Sunrise Foods", "Private individual", "Metro Pharma", "Blue Lake Hotels", "Vertex Logistics"]
TASKS = ["Call the complainant", "Collect evidence", "Agree remedy with finance", "Send written response", "Confirm fix with operations"]


def seed_history(db: Session, months: int = 21, rng_seed: int = 2026) -> int:
    if db.scalar(select(m.Case.id).where(m.Case.id.like("ch%")).limit(1)):
        return 0
    staff = list(db.scalars(select(m.Employee.id).where(m.Employee.org_role == "employee", m.Employee.active.is_(True))))
    if len(staff) < 2:
        return 0
    rng = random.Random(rng_seed)
    now = m.now()
    codes = [int(c[4:]) for c in db.scalars(select(m.Case.code)) if c.startswith("CMP-") and c[4:].isdigit()]
    next_code = max(codes, default=1000) + 1

    def audit(at: datetime, actor: str, action: str, case_id: str, detail: str) -> None:
        db.add(m.AuditEvent(id=m.uid("a"), at=at, actor_id=actor, action=action, case_id=case_id, detail=detail))

    created = 0
    for back in range(months, 0, -1):
        y, mo = now.year, now.month - back
        while mo <= 0:
            y, mo = y - 1, mo + 12
        month_start = datetime(y, mo, 1, tzinfo=now.tzinfo)
        for _ in range(rng.randint(4, 9) + (2 if mo in (11, 12) else 0)):  # a small year-end bump
            received = month_start + timedelta(days=rng.randint(0, 27), hours=rng.randint(8, 18), minutes=rng.randint(0, 59))
            category = rng.choices(list(CATEGORY_WEIGHTS), weights=list(CATEGORY_WEIGHTS.values()))[0]
            complainant = rng.choice(COMPLAINANTS)
            owner = first_owner = rng.choice(staff)
            creator = rng.choice(staff)
            resolved_at = received + timedelta(days=rng.uniform(1.5, 24))
            # Old cases are all closed; only recent ones may still be open, so alerts show today's problems, not history
            recent = received > now - timedelta(days=45)
            resolved = resolved_at < now and (not recent or rng.random() < 0.6)

            cid = m.uid("ch")
            c = m.Case(
                id=cid, code=f"CMP-{next_code}", title=rng.choice(TITLES[category]).format(c=complainant), complainant=complainant,
                channel=rng.choice(["Email", "Phone", "Web form", "Branch", "Social"]), category=category,
                priority=rng.choices(["high", "medium", "low"], weights=[3, 5, 2])[0],
                stage="resolved" if resolved else rng.choice(["investigation", "action"]), owner_id=owner, created_by=creator,
                received_at=received, updated_at=resolved_at if resolved else received + timedelta(days=2),
                summary=f"{category} complaint from {complainant}, handled through the standard process.",
            )
            next_code += 1
            db.add(c)
            db.flush()  # the case row must exist before rows that reference it
            audit(received, creator, "case.created", cid, f"Registered {c.code} from {c.channel}")

            owner_since, via = received, "created"
            if rng.random() < 0.35:  # forwarded once
                to = rng.choice([s for s in staff if s != owner])
                sent = received + timedelta(days=rng.uniform(1, 4))
                decided = sent + timedelta(hours=rng.uniform(2, 40))
                accepted = rng.random() < 0.8
                reason = rng.choice(["leave", "workload", "expertise", "escalation"])
                db.add(m.Handoff(
                    id=m.uid("hh"), case_id=cid, from_id=owner, to_id=to, reason=reason, reason_note="Forwarded as part of normal case management.",
                    summary="Context, decisions and open tasks handed over.", status="accepted" if accepted else "rejected",
                    created_at=sent, decided_at=decided, reject_reason=None if accepted else "Not the right team for this complaint.",
                    acks={s: accepted for s in SECTIONS}, reminded=True,
                ))
                audit(sent, owner, "handoff.submitted", cid, f"Forwarded · {reason} · score 100%")
                if accepted:
                    audit(decided, to, "handoff.accepted", cid, "All 5 sections acknowledged")
                    db.add(m.Ownership(case_id=cid, user_id=owner, from_at=owner_since, to_at=decided, via="created"))
                    owner, owner_since, via = to, decided, "handoff"
                else:
                    audit(decided, to, "handoff.rejected", cid, "Not the right team for this complaint.")
            db.add(m.Ownership(case_id=cid, user_id=owner, from_at=owner_since, via=via))
            c.owner_id = owner

            for _t in range(rng.randint(1, 3)):
                due = received + timedelta(days=rng.uniform(2, 12))
                assignee = rng.choice(staff)
                done = resolved or rng.random() < 0.5
                if not done and due < now:
                    due = now + timedelta(days=rng.uniform(1, 10))  # open work on an open case is still in date
                done_at = max(received, min(resolved_at, due + timedelta(days=rng.uniform(-2, 4)))) if done else None
                title = rng.choice(TASKS)
                db.add(m.Task(id=m.uid("th"), case_id=cid, title=title, owner_id=assignee, due=due, done=done, created_at=received,
                              overdue_notified=True, due_soon_notified=True, escalated=True))
                if due < now and (done_at is None or done_at > due):
                    audit(due, "system", "deadline.overdue", cid, title)
                    if rng.random() < 0.3:
                        audit(due + timedelta(hours=48), "system", "deadline.escalated", cid, f"{title} escalated to admins")
                if done_at:
                    audit(done_at, assignee, "task.updated", cid, f"{title}: completed")
            if resolved:
                audit(resolved_at, owner, "stage.changed", cid, "action → resolved")
            created += 1
    db.commit()
    return created
