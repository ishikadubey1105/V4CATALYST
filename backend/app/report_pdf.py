"""
The monthly / yearly report as a two-page A4 PDF: executive summary, headline figures, key findings and charts.
Built from the same data as GET /reports/summary (reports.build_report), so the PDF and the web page always agree.
"""
from datetime import datetime, timedelta
from io import BytesIO

import matplotlib
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

from matplotlib import font_manager  # noqa: E402

# Chart text in the closest installed match to the PDF's Helvetica (chosen once, so matplotlib doesn't warn per glyph)
_installed = {f.name for f in font_manager.fontManager.ttflist}
matplotlib.rcParams["font.family"] = next((f for f in ("Arial", "Helvetica", "Liberation Sans") if f in _installed), "DejaVu Sans")

# Validated categorical slots 1-2 (blue / orange) on a white surface; text stays in ink colours.
BLUE, ORANGE = "#55701a", "#c08040"  # olive / caramel brown, validated as a pair on white
INK, MUTED, RULE, PANEL = "#2b231c", "#8c7d6a", "#ebe5dc", "#f5f2ed"  # warm neutrals, as in the web app
STAGES = {"received": "Received", "investigation": "Investigation", "action": "Action", "handoff": "Handoff", "resolved": "Resolved"}

PAGE_W, PAGE_H = A4
MARGIN = 16 * mm
FRAME_PAD = 6  # SimpleDocTemplate's frame pads 6pt each side; tables sized to the padded width line up with text
CONTENT_W = PAGE_W - 2 * MARGIN - 2 * FRAME_PAD

styles = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=INK),
    "sub": ParagraphStyle("sub", fontName="Helvetica", fontSize=9.5, leading=13, textColor=MUTED),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=INK, spaceBefore=4, spaceAfter=5),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=14, textColor=INK, alignment=TA_LEFT),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=8, leading=10.5, textColor=MUTED),
    "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=INK, leftIndent=10, bulletIndent=0),
    "kpi_label": ParagraphStyle("kl", fontName="Helvetica", fontSize=7.8, leading=10, textColor=MUTED),
    "kpi_value": ParagraphStyle("kv", fontName="Helvetica-Bold", fontSize=17, leading=20, textColor=INK),
    "kpi_delta": ParagraphStyle("kd", fontName="Helvetica", fontSize=7.5, leading=9.5, textColor=MUTED),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK),
}


# ---------- Charts (matplotlib, object API so it is safe off the main thread) ----------

def _figure(w_mm: float, h_mm: float) -> Figure:
    fig = Figure(figsize=(w_mm / 25.4, h_mm / 25.4), dpi=200)
    fig.patch.set_facecolor("white")
    return fig


def _style_axes(ax, grid_axis: str = "y") -> None:
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color("#a1a1aa")
    ax.tick_params(colors=MUTED, labelsize=7, length=0)
    ax.grid(axis=grid_axis, color=RULE, linewidth=0.6)
    ax.set_axisbelow(True)


def _png(fig: Figure, w_mm: float, h_mm: float) -> Image:
    buf = BytesIO()
    FigureCanvasAgg(fig).print_png(buf)
    buf.seek(0)
    return Image(buf, width=w_mm * mm, height=h_mm * mm)


def trend_chart(report: dict, w_mm: float, h_mm: float) -> Image:
    trend = report["trend"]
    fig = _figure(w_mm, h_mm)
    ax = fig.add_axes((0.05, 0.16, 0.94, 0.72))
    _style_axes(ax)
    x = range(len(trend))
    width = 0.38
    ax.bar([i - width / 2 - 0.01 for i in x], [b["received"] for b in trend], width, color=BLUE, label="Received")
    ax.bar([i + width / 2 + 0.01 for i in x], [b["resolved"] for b in trend], width, color=ORANGE, label="Resolved")
    every = 1 if len(trend) <= 12 else 5
    ax.set_xticks([i for i in x if i % every == 0 or len(trend) <= 12])
    ax.set_xticklabels([trend[i]["label"] for i in x if i % every == 0 or len(trend) <= 12])
    ax.set_xlim(-0.6, len(trend) - 0.4)
    ax.yaxis.get_major_locator().set_params(integer=True)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncols=2, frameon=False, fontsize=7.5, handlelength=1, handleheight=1, borderaxespad=0.2)
    return _png(fig, w_mm, h_mm)


def bar_chart(items: list[dict], w_mm: float, label=lambda k: k) -> Image:
    """Ranked horizontal bars (top 6); height grows with the bar count so bars keep the same thickness."""
    h_mm = 9 + 5 * min(len(items), 6) if items else 12
    fig = _figure(w_mm, h_mm)
    if not items:
        fig.text(0.5, 0.5, "No complaints in this period", ha="center", va="center", fontsize=7.5, color=MUTED)
        return _png(fig, w_mm, h_mm)
    items = items[:6]
    ax = fig.add_axes((0.36, 2.5 / h_mm, 0.56, 1 - 5 / h_mm))
    _style_axes(ax, grid_axis="x")
    ax.spines["bottom"].set_visible(False)
    names = [label(i["key"]) for i in items][::-1]
    values = [i["count"] for i in items][::-1]
    ax.barh(names, values, color=BLUE, height=0.64)
    ax.set_ylim(-0.6, len(values) - 0.4)
    ax.set_xticks([])
    for y, v in enumerate(values):  # direct labels: one number per bar
        ax.text(v + max(values) * 0.02, y, str(v), va="center", fontsize=7.5, color=INK)
    ax.set_xlim(0, max(values) * 1.18)
    ax.tick_params(axis="y", labelsize=7.5, colors=INK)
    return _png(fig, w_mm, h_mm)


# ---------- Content helpers ----------

def _fmt(v, unit: str = "") -> str:
    return "—" if v is None else f"{v}{unit}"


def _delta(cur, prev, prev_label: str, unit: str = "") -> str:
    if prev is None:
        return f"{prev_label}: no data"
    if cur is None:
        return f"{prev_label}: {prev:g}{unit}"
    d = round(cur - prev, 1)
    change = "no change" if d == 0 else f"{'+' if d > 0 else '–'}{abs(d):g}"
    return f"{prev_label}: {prev:g}{unit} ({change})"


def key_findings(r: dict, alerts: list[dict] | None) -> list[str]:
    k, p, label = r["kpis"], r["previous"], r["period"]["previousLabel"]
    out: list[str] = []
    if r["byCategory"] and k["received"]:
        top = r["byCategory"][0]
        out.append(f"<b>{top['key']}</b> was the largest category: {top['count']} of {k['received']} complaints "
                   f"({round(100 * top['count'] / k['received'])}%).")
    busiest = max(r["trend"], key=lambda b: b["received"], default=None)
    if busiest and busiest["received"]:
        if r["period"]["kind"] == "year":
            out.append(f"Busiest month: <b>{busiest['label']}</b> with {busiest['received']} new complaints.")
        else:
            month = r["period"]["label"].split(" ")[0]
            out.append(f"Busiest day: <b>{busiest['label']} {month}</b> with {busiest['received']} new complaints.")
    if k["avgResolutionDays"] is not None and p["avgResolutionDays"] is not None:
        faster = k["avgResolutionDays"] < p["avgResolutionDays"]
        out.append(f"Average time to resolve {'improved' if faster else 'rose'} to <b>{k['avgResolutionDays']} days</b> "
                   f"(from {p['avgResolutionDays']} in {label}).")
    if k["acceptanceRate"] is not None:
        out.append(f"<b>{k['acceptanceRate']}%</b> of forwarded cases were accepted by the receiver"
                   + (f"; average wait before acceptance {k['avgAcceptHours']} h." if k["avgAcceptHours"] is not None else "."))
    if k["overdueEvents"]:
        out.append(f"<b>{k['overdueEvents']}</b> task deadlines were missed; {k['escalations']} reached the 48-hour escalation to admins.")
    overdue_people = [x for x in r["people"] if x["overdueNow"]]
    if overdue_people:
        names = ", ".join(f"{x['name']} ({x['overdueNow']})" for x in overdue_people[:3])
        out.append(f"Overdue work right now sits with {names}.")
    if alerts is not None:
        crit = sum(a["severity"] == "critical" for a in alerts)
        if crit:
            out.append(f"<b>{crit} critical alert{'s' if crit != 1 else ''}</b> open at the time of this report (listed under Open risks).")
    return out[:6]


def _kpi_grid(r: dict) -> Table:
    k, p, pl = r["kpis"], r["previous"], r["period"]["previousLabel"]
    tiles = [
        ("Complaints received", k["received"], p["received"], ""),
        ("Resolved", k["resolved"], p["resolved"], ""),
        ("Avg. time to resolve", k["avgResolutionDays"], p["avgResolutionDays"], " days"),
        ("Open at period end", k["openAtEnd"], p["openAtEnd"], ""),
        ("Cases forwarded", k["handoffsSubmitted"], p["handoffsSubmitted"], ""),
        ("Forwards accepted", k["acceptanceRate"], p["acceptanceRate"], "%"),
        ("Deadlines missed", k["overdueEvents"], p["overdueEvents"], ""),
        ("Escalated to admins", k["escalations"], p["escalations"], ""),
    ]
    cells = [[Paragraph(lbl, styles["kpi_label"]), Paragraph(_fmt(v, unit), styles["kpi_value"]), Paragraph(_delta(v, pv, pl, unit), styles["kpi_delta"])]
             for lbl, v, pv, unit in tiles]
    rows = [cells[0:4], cells[4:8]]
    t = Table(rows, colWidths=[CONTENT_W / 4] * 4)
    t.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor(RULE)),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, colors.HexColor(RULE)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def _table(header: list[str], rows: list[list], widths: list[float], numeric_from: int = 1) -> Table:
    right = ParagraphStyle("small_r", parent=styles["small"], alignment=2)
    data = [[Paragraph(f"<b>{h}</b>", right if i >= numeric_from else styles["small"]) for i, h in enumerate(header)]] + [
        [Paragraph(str(c), styles["cell"]) if i < numeric_from else str(c) for i, c in enumerate(row)] for row in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(PANEL)),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor(RULE)),
        ("FONTNAME", (numeric_from, 1), (-1, -1), "Helvetica"), ("FONTSIZE", (numeric_from, 1), (-1, -1), 8.5),
        ("ALIGN", (numeric_from, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


def _section(title: str, *flowables) -> KeepTogether:
    return KeepTogether([Paragraph(title, styles["h2"]), *flowables])


# ---------- Document ----------

def render_report_pdf(r: dict, alerts: list[dict] | None, generated_by: str) -> bytes:
    period = r["period"]
    kind = "Yearly" if period["kind"] == "year" else "Monthly"
    start = datetime.fromisoformat(period["start"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(period["end"].replace("Z", "+00:00"))
    span = f"{start:%d %b %Y} to {end - timedelta(days=1):%d %b %Y}"  # end is exclusive
    generated = datetime.fromisoformat(r["generatedAt"].replace("Z", "+00:00"))

    def page_frame(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(colors.HexColor("#343b1c"))  # brand olive band
        canvas.rect(0, PAGE_H - 11 * mm, PAGE_W, 11 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(MARGIN, PAGE_H - 7.2 * mm, "BATON")
        canvas.setFont("Helvetica", 8.5)
        canvas.drawString(MARGIN + 15 * mm, PAGE_H - 7.2 * mm, "Complaint handling report")
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 7.2 * mm, f"{kind} · {period['label']}")
        canvas.setStrokeColor(colors.HexColor(RULE))
        canvas.line(MARGIN, 12 * mm, PAGE_W - MARGIN, 12 * mm)
        canvas.setFillColor(colors.HexColor(MUTED))
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(MARGIN, 8 * mm, f"Generated {generated:%d %b %Y, %H:%M} UTC by {generated_by} · Internal — confidential")
        canvas.drawRightString(PAGE_W - MARGIN, 8 * mm, f"Page {doc.page}")
        canvas.restoreState()

    story: list = [
        Paragraph(f"{kind} report — {period['label']}", styles["title"]),
        Paragraph(f"{span} · compared with {period['previousLabel']}", styles["sub"]),
        Spacer(1, 5 * mm),
    ]

    summary = Table([[Paragraph(r["summary"], styles["body"])]], colWidths=[CONTENT_W])
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(PANEL)),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, colors.HexColor(INK)),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story += [_section("Executive summary", summary), Spacer(1, 3 * mm),
              _section("Headline figures", _kpi_grid(r)), Spacer(1, 3 * mm)]

    findings = key_findings(r, alerts)
    if findings:
        story.append(_section("Key findings", *[Paragraph(f, styles["bullet"], bulletText="•") for f in findings]))
        story.append(Spacer(1, 3 * mm))

    unit = "month" if period["kind"] == "year" else "day"
    story.append(_section(f"Complaints received and resolved, by {unit}", trend_chart(r, CONTENT_W / mm, 62)))

    # ---- page 2: detail
    story.append(PageBreak())
    half = (CONTENT_W - 6 * mm) / 2 / mm
    charts = Table([
        [Paragraph("By category", styles["h2"]), Paragraph("By channel", styles["h2"])],
        [bar_chart(r["byCategory"], half), bar_chart(r["byChannel"], half)],
        [Paragraph("By priority", styles["h2"]), Paragraph("Where this period's complaints are now", styles["h2"])],
        [bar_chart(r["byPriority"], half, label=str.capitalize), bar_chart(r["byStage"], half, label=lambda k: STAGES.get(k, k))],
    ], colWidths=[CONTENT_W / 2] * 2)
    charts.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story += [charts, Spacer(1, 2 * mm)]
    if alerts:
        top = [a for a in alerts if a["severity"] in ("critical", "high")][:6]
        if top:
            rows = [[a["severity"].upper(), f"{a['title']}<br/><font color='{MUTED}' size='7'>{a['detail']}</font>", a["caseCode"]] for a in top]
            t = _table(["Severity", "Open risk", "Case"], rows, [CONTENT_W * 0.14, CONTENT_W * 0.72, CONTENT_W * 0.14], numeric_from=2)
            t.setStyle(TableStyle([("TEXTCOLOR", (0, 1), (0, -1), colors.HexColor("#b91c1c")), ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
                                   ("FONTSIZE", (0, 1), (0, -1), 7.5)]))
            story.append(_section("Open risks at the time of this report", t))
            story.append(Spacer(1, 3 * mm))


    k, p, pl = r["kpis"], r["previous"], period["previousLabel"]
    flow_rows = [
        ["Cases forwarded", k["handoffsSubmitted"], p["handoffsSubmitted"]],
        ["Forwards accepted / rejected", f"{k['handoffsAccepted']} / {k['handoffsRejected']}", f"{p['handoffsAccepted']} / {p['handoffsRejected']}"],
        ["Avg. wait before acceptance (h)", _fmt(k["avgAcceptHours"]), _fmt(p["avgAcceptHours"])],
        ["Admin reassignments", k["forcedReassignments"], p["forcedReassignments"]],
        ["Tasks completed", k["tasksCompleted"], p["tasksCompleted"]],
        ["Deadlines missed / escalated", f"{k['overdueEvents']} / {k['escalations']}", f"{p['overdueEvents']} / {p['escalations']}"],
    ]
    story.append(_section("Handoffs and deadlines", _table(["Measure", period["label"], pl], flow_rows,
                                                           [CONTENT_W * 0.5, CONTENT_W * 0.25, CONTENT_W * 0.25])))
    story.append(Spacer(1, 3 * mm))

    people = [[f"{x['name']} <font color='{MUTED}' size='7'>· {x['department']}</font>", x["openCases"], x["resolved"],
               x["handoffsSent"], x["handoffsAccepted"], x["tasksCompleted"], x["overdueNow"]] for x in r["people"][:12]]
    if people:
        w = CONTENT_W
        story.append(_section("Team", _table(["Employee", "Open now", "Resolved", "Forwards sent", "Forwards taken", "Tasks done", "Overdue now"],
                                             people, [w * 0.37] + [w * 0.105] * 6)))
        story.append(Spacer(1, 3 * mm))

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=17 * mm, bottomMargin=17 * mm,
                            title=f"Baton {kind.lower()} report — {period['label']}", author=generated_by, subject="Complaint handling report")
    doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
    return buf.getvalue()
