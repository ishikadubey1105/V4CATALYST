import csv
from io import StringIO
from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import Response

from .. import models as m
from ..alerts import compute_alerts, summarize
from ..config import settings
from ..deadlines import run_watcher_if_due
from ..deps import CurrentUser, Db
from ..errors import bad_request, forbidden
from ..report_pdf import render_report_pdf
from ..reports import Period, build_report, download_stats, iso_weeks, make_period
from ..services import log

router = APIRouter(tags=["insights"])


@router.get("/alerts")
def alerts(user: CurrentUser, db: Db):
    """Live alerts: overdue / due-soon tasks, waiting forwards, unanswered questions, stale cases (scoped to the caller)."""
    if settings.serverless:
        run_watcher_if_due()
    items = compute_alerts(db, user)
    return {"alerts": items, "counts": summarize(items)}


def _require_reports(user: m.Employee) -> None:
    if user.org_role not in ("admin", "auditor"):
        raise forbidden("Reports are available to admins and auditors.")


def _period(user: m.Employee, period: str, year: int | None, month: int | None, week: int | None) -> Period:
    _require_reports(user)
    now = m.now()
    if period == "week":
        iso_year, iso_week, _ = now.isocalendar()
        year, week = year or iso_year, week or (iso_week if not year or year == iso_year else 1)
        if month is not None:
            raise bad_request("month is not valid with period=week")
        if week > iso_weeks(year):
            raise bad_request(f"{year} has {iso_weeks(year)} ISO weeks")
        return make_period("week", year, None, week)
    if week is not None:
        raise bad_request("week is only valid with period=week")
    year = year or now.year
    if period == "month":
        month = month or now.month
    elif month is not None:
        raise bad_request("month is only valid with period=month")
    return make_period(period, year, month)


PeriodParam = Query(default="month")
YearParam = Query(default=None, ge=2000, le=2100)
MonthParam = Query(default=None, ge=1, le=12)
WeekParam = Query(default=None, ge=1, le=53)
DownloadParam = Query(default=True, description="false for an in-page preview: served inline and not counted as a download")
Kind = Literal["week", "month", "year"]


def _stamp(p: Period) -> str:
    if p.kind == "week":
        return f"{p.year}-W{p.week:02d}"
    return f"{p.year}" if p.kind == "year" else f"{p.year}-{p.month:02d}"


def _file(body: bytes | str, media: str, name: str, download: bool) -> Response:
    return Response(body, media_type=media, headers={"Content-Disposition": f'{"attachment" if download else "inline"}; filename="{name}"'})


@router.get("/reports/summary")
def report_summary(user: CurrentUser, db: Db, period: Kind = PeriodParam,
                   year: int | None = YearParam, month: int | None = MonthParam, week: int | None = WeekParam):
    """Weekly, monthly or yearly management report. Admins and auditors only."""
    return build_report(db, _period(user, period, year, month, week))


@router.get("/reports/summary.pdf")
def report_pdf(user: CurrentUser, db: Db, period: Kind = PeriodParam, year: int | None = YearParam,
               month: int | None = MonthParam, week: int | None = WeekParam, download: bool = DownloadParam):
    """The same report as an A4 PDF with charts. Open risks are included when the period covers today."""
    p = _period(user, period, year, month, week)
    report = build_report(db, p)
    current = p.start <= m.now() < p.end
    pdf = render_report_pdf(report, compute_alerts(db, user) if current else None, user.name)
    if download:
        log(db, "report.exported", f"{report['period']['label']} report downloaded as PDF", actor_id=user.id)
        db.commit()
    return _file(pdf, "application/pdf", f"thread-report-{_stamp(p)}.pdf", download)


METRIC_LABELS = {
    "received": "Complaints registered", "resolved": "Complaints closed (resolved)", "openAtEnd": "Open at period end (backlog)",
    "avgResolutionDays": "Mean days to resolve", "medianResolutionDays": "Median days to resolve", "resolvedWithin14d": "% resolved within 14 days",
    "handoffsSubmitted": "Cases forwarded", "handoffsAccepted": "Forwards accepted", "handoffsRejected": "Forwards sent back",
    "acceptanceRate": "Forward acceptance rate (%)", "avgAcceptHours": "Mean hours before acceptance", "forcedReassignments": "Admin reassignments",
    "tasksCompleted": "Tasks completed", "overdueEvents": "Deadlines missed", "escalations": "Escalations to admins", "reportsDownloaded": "Reports downloaded",
}


def report_csv_text(r: dict) -> str:
    """The report's data as CSV: metrics, trend, breakdowns, people, and the registered / closed case lists."""
    out = StringIO()
    w = csv.writer(out, lineterminator="\r\n")
    per = r["period"]
    w.writerows([["Thread complaint report", per["label"], per["span"]], ["Generated", r["generatedAt"]], [],
                 ["Metric", per["label"], per["previousLabel"]]])
    w.writerows([METRIC_LABELS.get(k, k), r["kpis"][k], r["previous"][k]] for k in r["kpis"])
    w.writerows([[], [{"year": "Month"}.get(per["kind"], "Day"), "Registered", "Closed", "Forwarded", "Open at end"]])
    w.writerows([b["label"], b["received"], b["resolved"], b["handoffs"], "" if b["open"] is None else b["open"]] for b in r["trend"])
    for title, key in (("Category", "byCategory"), ("Priority", "byPriority"), ("Channel", "byChannel")):
        w.writerows([[], [title, "Complaints"], *([b["key"], b["count"]] for b in r[key])])
    w.writerows([[], ["Employee", "Department", "Open cases now", "Resolved", "Forwards sent", "Forwards accepted", "Tasks completed", "Overdue now"]])
    w.writerows([p["name"], p["department"], p["openCases"], p["resolved"], p["handoffsSent"], p["handoffsAccepted"], p["tasksCompleted"], p["overdueNow"]]
                for p in r["people"])
    w.writerows([[], ["Cases registered"], ["Code", "Title", "Complainant", "Category", "Priority", "Channel", "Owner", "Stage now", "Received"]])
    w.writerows([c["code"], c["title"], c["complainant"], c["category"], c["priority"], c["channel"], c["owner"], c["stage"], c["receivedAt"]]
                for c in r["casesRegistered"])
    w.writerows([[], ["Cases closed"], ["Code", "Title", "Complainant", "Category", "Priority", "Received", "Resolved", "Days to resolve", "Resolved by"]])
    w.writerows([c["code"], c["title"], c["complainant"], c["category"], c["priority"], c["receivedAt"], c["resolvedAt"], c["daysToResolve"], c["resolvedBy"]]
                for c in r["casesClosed"])
    return out.getvalue()


@router.get("/reports/summary.csv")
def report_csv(user: CurrentUser, db: Db, period: Kind = PeriodParam,
               year: int | None = YearParam, month: int | None = MonthParam, week: int | None = WeekParam):
    """The report's data as CSV (opens in Excel / Sheets)."""
    p = _period(user, period, year, month, week)
    report = build_report(db, p)
    log(db, "report.exported", f"{report['period']['label']} report downloaded as CSV", actor_id=user.id)
    db.commit()
    # BOM so Excel reads the en dashes and names as UTF-8
    return _file("﻿" + report_csv_text(report), "text/csv; charset=utf-8", f"thread-report-{_stamp(p)}.csv", True)


@router.get("/reports/downloads")
def report_downloads(user: CurrentUser, db: Db):
    """How many reports were downloaded (this week, this month, all time, by format) and the latest downloads."""
    _require_reports(user)
    return download_stats(db)
