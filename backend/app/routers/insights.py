from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import Response

from .. import models as m
from ..alerts import compute_alerts, summarize
from ..deps import CurrentUser, Db
from ..errors import bad_request, forbidden
from ..report_pdf import render_report_pdf
from ..reports import Period, build_report, make_period
from ..services import log

router = APIRouter(tags=["insights"])


@router.get("/alerts")
def alerts(user: CurrentUser, db: Db):
    """Live alerts: overdue / due-soon tasks, waiting forwards, unanswered questions, stale cases (scoped to the caller)."""
    items = compute_alerts(db, user)
    return {"alerts": items, "counts": summarize(items)}


def _period(user: m.Employee, period: str, year: int | None, month: int | None) -> Period:
    if user.org_role not in ("admin", "auditor"):
        raise forbidden("Reports are available to admins and auditors.")
    now = m.now()
    year = year or now.year
    if period == "month":
        month = month or now.month
    elif month is not None:
        raise bad_request("month is only valid with period=month")
    return make_period(period, year, month)


PeriodParam = Query(default="month")
YearParam = Query(default=None, ge=2000, le=2100)
MonthParam = Query(default=None, ge=1, le=12)


@router.get("/reports/summary")
def report_summary(user: CurrentUser, db: Db, period: Literal["month", "year"] = PeriodParam,
                   year: int | None = YearParam, month: int | None = MonthParam):
    """Monthly or yearly management report. Admins and auditors only."""
    return build_report(db, _period(user, period, year, month))


@router.get("/reports/summary.pdf")
def report_pdf(user: CurrentUser, db: Db, period: Literal["month", "year"] = PeriodParam,
               year: int | None = YearParam, month: int | None = MonthParam):
    """The same report as a two-page A4 PDF with charts. Open risks are included when the period covers today."""
    p = _period(user, period, year, month)
    report = build_report(db, p)
    current = p.start <= m.now() < p.end
    pdf = render_report_pdf(report, compute_alerts(db, user) if current else None, user.name)
    log(db, "report.exported", f"{report['period']['label']} report downloaded as PDF", actor_id=user.id)
    db.commit()
    stamp = f"{p.year}" if p.kind == "year" else f"{p.year}-{p.month:02d}"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="baton-report-{stamp}.pdf"'})
