"""
Weekly / monthly / yearly management report, built from the records and the append-only audit trail
(the audit log is what lets us say *when* a case was resolved or a task completed).

Everything is computed here, in Python, from the database: no external service is involved, so reports work offline
and cost nothing per download. Queries are bounded by the period end and limited to the audit actions a report
reads (indexed on action + at), so the work grows with the activity being reported, not with the whole log.
"""
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from statistics import mean, median

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from . import models as m
from .serializers import iso

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
CASE_LIST_LIMIT = 500  # per list in the JSON/CSV; the PDF shows fewer
EXPORT_FORMATS = ("PDF", "CSV")  # audit detail of a download ends with " as <format>"


@dataclass
class Period:
    kind: str  # "week" | "month" | "year"
    year: int  # ISO year for weeks
    month: int | None
    start: datetime
    end: datetime  # exclusive
    week: int | None = None

    @property
    def label(self) -> str:
        if self.kind == "week":
            return f"Week {self.week}, {self.year}"
        return f"{MONTHS[self.month - 1]} {self.year}" if self.kind == "month" else str(self.year)

    @property
    def span(self) -> str:
        """Calendar dates covered, e.g. "5–11 Oct 2026"."""
        last = self.end - timedelta(days=1)
        if self.start.month == last.month:
            return f"{self.start.day}–{last.day} {MONTHS[last.month - 1]} {last.year}"
        return f"{self.start.day} {MONTHS[self.start.month - 1]} – {last.day} {MONTHS[last.month - 1]} {last.year}"

    def previous(self) -> "Period":
        if self.kind == "week":
            y, w, _ = (self.start - timedelta(days=7)).isocalendar()
            return make_period("week", y, None, w)
        if self.kind == "year":
            return make_period("year", self.year - 1, None)
        y, mo = (self.year, self.month - 1) if self.month > 1 else (self.year - 1, 12)
        return make_period("month", y, mo)

    def buckets(self) -> list[tuple[str, datetime, datetime]]:
        if self.kind == "year":
            return [(MONTHS[i], _utc(self.year, i + 1), _month_end(self.year, i + 1)) for i in range(12)]
        days = (self.end - self.start).days
        out = []
        for d in range(days):
            s = self.start + timedelta(days=d)
            out.append((f"{DAYS[s.weekday()]} {s.day}" if self.kind == "week" else str(d + 1), s, s + timedelta(days=1)))
        return out


def _utc(y: int, mo: int, d: int = 1) -> datetime:
    return datetime(y, mo, d, tzinfo=timezone.utc)


def _month_end(y: int, mo: int) -> datetime:
    return _utc(y + 1, 1) if mo == 12 else _utc(y, mo + 1)


def iso_weeks(year: int) -> int:
    return date(year, 12, 28).isocalendar()[1]


def make_period(kind: str, year: int, month: int | None, week: int | None = None) -> Period:
    if kind == "week":
        d = date.fromisocalendar(year, week, 1)
        start = _utc(d.year, d.month, d.day)
        return Period("week", year, None, start, start + timedelta(days=7), week)
    if kind == "year":
        return Period("year", year, None, _utc(year, 1), _utc(year + 1, 1))
    return Period("month", year, month, _utc(year, month), _month_end(year, month))


def _in(at: datetime | None, p: Period) -> bool:
    return at is not None and p.start <= at < p.end


# Audit actions a report reads. Anything else in the log is never loaded.
REPORT_ACTIONS = ("handoff.forced", "deadline.overdue", "deadline.escalated", "report.exported")


class Facts:
    """Everything the report needs up to `until`, loaded once."""

    def __init__(self, db: Session, until: datetime):
        self.now = m.now()
        self.employees = list(db.scalars(select(m.Employee).order_by(m.Employee.name)))
        self.names = {e.id: e.name for e in self.employees}
        self.cases = {c.id: c for c in db.scalars(select(m.Case).where(m.Case.received_at < until))}
        self.handoffs = list(db.scalars(select(m.Handoff).where(m.Handoff.created_at < until)))
        self.open_tasks = list(db.scalars(select(m.Task).where(m.Task.done.is_(False), m.Task.due.is_not(None))))
        A = m.AuditEvent
        self.audit = list(db.scalars(
            select(A).where(A.at < until, or_(
                A.action.in_(REPORT_ACTIONS),
                and_(A.action == "stage.changed", A.detail.like("%→ resolved")),
                and_(A.action == "task.updated", A.detail.like("%completed%")),
            )).order_by(A.at)
        ))
        # first time each case reached "resolved"
        self.resolved_at: dict[str, datetime] = {}
        self.resolved_by: dict[str, str] = {}
        for a in self.audit:
            if a.action == "stage.changed" and a.case_id and a.case_id not in self.resolved_at:
                self.resolved_at[a.case_id], self.resolved_by[a.case_id] = a.at, a.actor_id

    def events(self, action: str, p: Period, contains: str | None = None) -> list[m.AuditEvent]:
        return [a for a in self.audit if a.action == action and _in(a.at, p) and (contains is None or contains in a.detail)]


def _counts(f: Facts, p: Period) -> dict:
    received = [c for c in f.cases.values() if _in(c.received_at, p)]
    resolved = [cid for cid, at in f.resolved_at.items() if _in(at, p)]
    decided = [h for h in f.handoffs if _in(h.decided_at, p)]
    accepted = [h for h in decided if h.status == "accepted"]
    rejected = [h for h in decided if h.status == "rejected"]
    res_days = [(f.resolved_at[cid] - f.cases[cid].received_at).total_seconds() / 86400 for cid in resolved if cid in f.cases]
    open_at_end = [c for c in f.cases.values() if c.received_at < p.end and not (c.id in f.resolved_at and f.resolved_at[c.id] < p.end)]
    return {
        "received": len(received),
        "resolved": len(resolved),
        "openAtEnd": len(open_at_end),
        "avgResolutionDays": round(mean(res_days), 1) if res_days else None,
        "medianResolutionDays": round(median(res_days), 1) if res_days else None,
        "resolvedWithin14d": round(100 * sum(d <= 14 for d in res_days) / len(res_days)) if res_days else None,
        "handoffsSubmitted": sum(_in(h.created_at, p) for h in f.handoffs),
        "handoffsAccepted": len(accepted),
        "handoffsRejected": len(rejected),
        "acceptanceRate": round(100 * len(accepted) / len(decided)) if decided else None,
        "avgAcceptHours": round(mean((h.decided_at - h.created_at).total_seconds() / 3600 for h in accepted), 1) if accepted else None,
        "forcedReassignments": len(f.events("handoff.forced", p)),
        "tasksCompleted": len(f.events("task.updated", p, "completed")),
        "overdueEvents": len(f.events("deadline.overdue", p)),
        "escalations": len(f.events("deadline.escalated", p)),
        "reportsDownloaded": len(f.events("report.exported", p)),
    }


def _case_row(f: Facts, c: m.Case) -> dict:
    return {"id": c.id, "code": c.code, "title": c.title, "complainant": c.complainant, "category": c.category,
            "priority": c.priority, "channel": c.channel, "stage": c.stage, "owner": f.names.get(c.owner_id, "Unknown"),
            "receivedAt": iso(c.received_at)}


def build_report(db: Session, p: Period) -> dict:
    prev_p = p.previous()
    f = Facts(db, p.end)
    now = f.now
    kpis = _counts(f, p)
    # Like-for-like comparison: a period still in progress is compared with the same stretch of the previous one
    # (2026 to 12 Oct vs 2025 to 12 Oct), not with the whole previous period.
    prev_label = prev_p.label
    if p.start <= now < p.end:
        cut = min(prev_p.end, prev_p.start + (now - p.start))
        prev_p = Period(prev_p.kind, prev_p.year, prev_p.month, prev_p.start, cut, prev_p.week)
        if p.kind == "year":
            prev_label = f"{prev_p.year} to {cut:%d %b}"
        elif p.kind == "month":
            prev_label = f"{MONTHS[prev_p.month - 1]} 1–{cut.day}"
        else:
            prev_label = f"Week {prev_p.week} to {DAYS[(cut - timedelta(seconds=1)).weekday()]}"
    prev = _counts(f, prev_p)
    received = sorted((c for c in f.cases.values() if _in(c.received_at, p)), key=lambda c: c.received_at)
    closed = sorted(((cid, at) for cid, at in f.resolved_at.items() if _in(at, p) and cid in f.cases), key=lambda x: x[1])

    trend = []
    for label, start, end in p.buckets():
        b = Period(p.kind, p.year, p.month, start, end, p.week)
        trend.append({
            "label": label,
            "received": sum(_in(c.received_at, b) for c in f.cases.values()),
            "resolved": sum(_in(at, b) for at in f.resolved_at.values()),
            "handoffs": sum(_in(h.created_at, b) for h in f.handoffs),
            # backlog: received before the bucket ends and not resolved by then
            "open": sum(c.received_at < end and not (c.id in f.resolved_at and f.resolved_at[c.id] < end) for c in f.cases.values())
            if start <= now else None,
        })

    def breakdown(attr: str) -> list[dict]:
        return [{"key": k, "count": n} for k, n in Counter(getattr(c, attr) for c in received).most_common()]

    people = []
    for e in f.employees:
        if e.org_role == "auditor":
            continue
        row = {
            "employeeId": e.id, "name": e.name, "department": e.department,
            "openCases": sum(c.owner_id == e.id and c.stage != "resolved" for c in f.cases.values()),
            "resolved": sum(f.resolved_by.get(cid) == e.id for cid, at in f.resolved_at.items() if _in(at, p)),
            "handoffsSent": sum(h.from_id == e.id and _in(h.created_at, p) for h in f.handoffs),
            "handoffsAccepted": sum(h.to_id == e.id and h.status == "accepted" and _in(h.decided_at, p) for h in f.handoffs),
            "tasksCompleted": sum(a.actor_id == e.id for a in f.events("task.updated", p, "completed")),
            "overdueNow": sum(t.owner_id == e.id and t.due < now for t in f.open_tasks),
        }
        if any(v for k, v in row.items() if k not in ("employeeId", "name", "department")):
            people.append(row)
    people.sort(key=lambda r: (-r["resolved"], -r["openCases"], r["name"]))

    return {
        "period": {"kind": p.kind, "year": p.year, "month": p.month, "week": p.week, "label": p.label, "span": p.span,
                   "start": iso(p.start), "end": iso(p.end), "previousLabel": prev_label, "inProgress": p.start <= now < p.end},
        "generatedAt": iso(now),
        "kpis": kpis,
        "previous": prev,
        "trend": trend,
        "byCategory": breakdown("category"),
        "byPriority": breakdown("priority"),
        "byChannel": breakdown("channel"),
        "byStage": [{"key": k, "count": n} for k, n in Counter(c.stage for c in received).most_common()],
        "people": people,
        "casesRegistered": [_case_row(f, c) for c in received[:CASE_LIST_LIMIT]],
        "casesClosed": [{**_case_row(f, f.cases[cid]), "resolvedAt": iso(at), "resolvedBy": f.names.get(f.resolved_by[cid], "Unknown"),
                         "daysToResolve": round((at - f.cases[cid].received_at).total_seconds() / 86400, 1)}
                        for cid, at in closed[:CASE_LIST_LIMIT]],
        "summary": _narrative(p, prev_label, kpis, prev, received),
    }


def _narrative(p: Period, prev_label: str, k: dict, prev: dict, received: list[m.Case]) -> str:
    def change(cur: int, old: int) -> str:
        if old == 0:
            return "" if cur == 0 else " (none the period before)"
        if cur == old:
            return f" (same as {prev_label})"
        if old < 5:  # a % change on a tiny base misleads; give the absolute change
            return f" ({'+' if cur >= old else '–'}{abs(cur - old)} vs {prev_label})"
        pct = round(100 * (cur - old) / old)
        return f" ({'+' if pct >= 0 else '–'}{abs(pct)}% vs {prev_label})"

    when_label = f"{p.label} ({p.span})" if p.kind == "week" else p.label
    parts = [f"In {when_label}, {k['received']} complaint{'s were' if k['received'] != 1 else ' was'} registered{change(k['received'], prev['received'])}"
             f" and {k['resolved']} closed as resolved{change(k['resolved'], prev['resolved'])}."]
    if k["avgResolutionDays"] is not None:
        parts.append(f"Resolved cases took {k['avgResolutionDays']} days on average from receipt.")
    if k["handoffsSubmitted"]:
        rate = f", {k['acceptanceRate']}% of decided forwards were accepted" if k["acceptanceRate"] is not None else ""
        parts.append(f"{k['handoffsSubmitted']} case{'s were' if k['handoffsSubmitted'] != 1 else ' was'} forwarded{rate}.")
    high = sum(c.priority == "high" for c in received)
    if high:
        parts.append(f"{high} of the new complaints {'was' if high == 1 else 'were'} high priority.")
    if k["overdueEvents"] or k["escalations"]:
        missed = f"{k['overdueEvents']} task deadline{'s were' if k['overdueEvents'] != 1 else ' was'} missed"
        escalated = f" and {k['escalations']} escalated to admins" if k["escalations"] else ""
        parts.append(missed + escalated + ".")
    when = "at the time of writing" if p.start <= m.now() < p.end else "at the end of the period"
    parts.append(f"{k['openAtEnd']} complaint{'s remain' if k['openAtEnd'] != 1 else ' remains'} open {when}.")
    return " ".join(parts)


# ---------- Download activity (the "report downloads" metric) ----------

def download_stats(db: Session) -> dict:
    """How often reports are downloaded, by format, with the most recent downloads. Counted in SQL."""
    now = m.now()
    A = m.AuditEvent
    y, w, _ = now.isocalendar()
    week, month = make_period("week", y, None, w), make_period("month", now.year, now.month)

    def count(*where) -> int:
        return db.scalar(select(func.count()).select_from(A).where(A.action == "report.exported", *where)) or 0

    names = {e.id: e.name for e in db.scalars(select(m.Employee))}
    recent = db.scalars(select(A).where(A.action == "report.exported").order_by(A.at.desc()).limit(8))
    return {
        "total": count(),
        "thisWeek": count(A.at >= week.start, A.at < week.end),
        "thisMonth": count(A.at >= month.start, A.at < month.end),
        "byFormat": [{"key": f, "count": n} for f in EXPORT_FORMATS if (n := count(A.detail.like(f"% as {f}")))],
        "recent": [{"at": iso(a.at), "by": names.get(a.actor_id, "Someone"), "detail": a.detail,
                    "format": a.detail.rsplit(" as ", 1)[-1]} for a in recent],
    }
