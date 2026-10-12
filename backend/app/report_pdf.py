"""
The complaint handling report, as a management document (A4 PDF), generated in Python.

Layout follows how an operations / reporting team writes one: title block with report metadata, a written summary,
a key-metrics table against the previous period, numbered sections with captioned figures, a team table, current
open risks, and an appendix stating how every number is defined. Built from reports.build_report, so the PDF,
the CSV and the API all agree.
"""
from datetime import datetime, timedelta
from io import BytesIO

import matplotlib
from matplotlib import font_manager
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
from matplotlib.ticker import MaxNLocator
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from .config import local_tz
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# Chart text in the closest installed match to the PDF's Helvetica (chosen once, so matplotlib doesn't warn per glyph)
_installed = {f.name for f in font_manager.fontManager.ttflist}
matplotlib.rcParams["font.family"] = next((f for f in ("Arial", "Helvetica", "Liberation Sans") if f in _installed), "DejaVu Sans")

SERIES_1, SERIES_2 = "#55701a", "#c08040"  # olive / caramel, validated as a pair (colour-blind safe) on white
INK, BODY, MUTED, RULE, SHADE = "#1f1a15", "#3e3329", "#7a6d5d", "#d9d1c5", "#f4f1ec"
STAGES = {"received": "Received", "investigation": "Investigation", "action": "Action", "handoff": "Handoff", "resolved": "Resolved"}

PAGE_W, PAGE_H = A4
MARGIN = 20 * mm
FRAME_PAD = 6  # SimpleDocTemplate's frame pads 6pt each side
CONTENT_W = PAGE_W - 2 * MARGIN - 2 * FRAME_PAD

S = {
    "kicker": ParagraphStyle("kicker", fontName="Helvetica-Bold", fontSize=7.5, leading=10, textColor=MUTED),
    "title": ParagraphStyle("title", fontName="Times-Bold", fontSize=24, leading=28, textColor=INK, spaceBefore=4),
    "subtitle": ParagraphStyle("subtitle", fontName="Times-Roman", fontSize=13, leading=17, textColor=BODY),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=INK, spaceBefore=10, spaceAfter=6),
    "body": ParagraphStyle("body", fontName="Times-Roman", fontSize=10.5, leading=14.5, textColor=BODY, spaceAfter=5),
    "bullet": ParagraphStyle("bullet", fontName="Times-Roman", fontSize=10.5, leading=14, textColor=BODY, leftIndent=12, bulletIndent=2, spaceAfter=2),
    "caption": ParagraphStyle("caption", fontName="Helvetica-Oblique", fontSize=7.8, leading=10, textColor=MUTED, spaceBefore=3, spaceAfter=8),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.6, leading=11, textColor=BODY),
    "cell_r": ParagraphStyle("cell_r", fontName="Helvetica", fontSize=8.6, leading=11, textColor=BODY, alignment=TA_RIGHT),
    "head": ParagraphStyle("head", fontName="Helvetica-Bold", fontSize=7.6, leading=10, textColor=INK),
    "head_r": ParagraphStyle("head_r", fontName="Helvetica-Bold", fontSize=7.6, leading=10, textColor=INK, alignment=TA_RIGHT),
    "meta_k": ParagraphStyle("meta_k", fontName="Helvetica", fontSize=8.4, leading=11.5, textColor=MUTED),
    "meta_v": ParagraphStyle("meta_v", fontName="Helvetica", fontSize=8.4, leading=11.5, textColor=INK),
    "note": ParagraphStyle("note", fontName="Helvetica", fontSize=8, leading=10.5, textColor=MUTED),
    "def": ParagraphStyle("def", fontName="Helvetica", fontSize=8.4, leading=11.5, textColor=BODY, leftIndent=0, spaceAfter=3),
}


# ---------- "Page X of Y": a canvas that knows the page count before writing footers ----------

class NumberedCanvas(Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved: list[dict] = []

    def showPage(self):
        self._saved.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved)
        for state in self._saved:
            self.__dict__.update(state)
            self.setFont("Helvetica", 7.5)
            self.setFillColor(colors.HexColor(MUTED))
            self.drawRightString(PAGE_W - MARGIN, 11 * mm, f"Page {self._pageNumber} of {total}")
            super().showPage()
        super().save()


# ---------- Charts (matplotlib, object API — safe off the main thread) ----------

def _fig(w_mm: float, h_mm: float) -> Figure:
    fig = Figure(figsize=(w_mm / 25.4, h_mm / 25.4), dpi=220)
    fig.patch.set_facecolor("white")
    return fig


def _axes(fig: Figure, rect=(0.075, 0.17, 0.9, 0.74)):
    ax = fig.add_axes(rect)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color("#9b8f80")
        ax.spines[side].set_linewidth(0.6)
    ax.tick_params(colors=BODY, labelsize=6.8, length=2.5, width=0.5)
    ax.grid(axis="y", color="#e7e1d8", linewidth=0.5)
    ax.set_axisbelow(True)
    ax.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=5))
    return ax


def _image(fig: Figure, w_mm: float, h_mm: float) -> Image:
    buf = BytesIO()
    FigureCanvasAgg(fig).print_png(buf)
    buf.seek(0)
    return Image(buf, width=w_mm * mm, height=h_mm * mm)


def _ticks(ax, labels: list[str]) -> None:
    every = 1 if len(labels) <= 12 else 3
    idx = [i for i in range(len(labels)) if i % every == 0]
    ax.set_xticks(idx)
    ax.set_xticklabels([labels[i] for i in idx])
    ax.set_xlim(-0.7, len(labels) - 0.3)


def volume_chart(r: dict, w_mm: float, h_mm: float) -> Image:
    t = r["trend"]
    fig = _fig(w_mm, h_mm)
    ax = _axes(fig)
    x = range(len(t))
    w = 0.36
    ax.bar([i - w / 2 for i in x], [b["received"] for b in t], w, color=SERIES_1, label="Received", linewidth=0)
    ax.bar([i + w / 2 for i in x], [b["resolved"] for b in t], w, color=SERIES_2, label="Resolved", linewidth=0)
    _ticks(ax, [b["label"] for b in t])
    ax.set_ylabel("Complaints", fontsize=7, color=BODY)
    ax.legend(loc="upper left", bbox_to_anchor=(0, 1.13), ncols=2, frameon=False, fontsize=7, handlelength=1.1, columnspacing=1.4)
    return _image(fig, w_mm, h_mm)


def backlog_chart(r: dict, w_mm: float, h_mm: float) -> Image:
    t = [b for b in r["trend"] if b.get("open") is not None]
    fig = _fig(w_mm, h_mm)
    ax = _axes(fig)
    labels = [b["label"] for b in r["trend"]]
    ys = [b["open"] for b in t]
    ax.plot(range(len(t)), ys, color=INK, linewidth=1.3, marker="o", markersize=2.6)
    if ys:
        ax.fill_between(range(len(t)), ys, color=SERIES_1, alpha=0.08, linewidth=0)
        ax.annotate(f"{ys[-1]}", (len(t) - 1, ys[-1]), textcoords="offset points", xytext=(4, 4), fontsize=7, color=INK)
        ax.set_ylim(0, max(ys) * 1.25 + 1)
    _ticks(ax, labels)
    ax.set_ylabel("Open cases", fontsize=7, color=BODY)
    return _image(fig, w_mm, h_mm)


# ---------- Tables ----------

def _num(v, unit: str = "") -> str:
    if v is None:
        return "–"
    return f"{v:.1f}{unit}" if isinstance(v, float) else f"{v}{unit}"


def _change(cur, prev, pct: bool = True, unit: str = "") -> str:
    """Absolute change, plus % change where it means something; percentages change in points."""
    if cur is None or prev is None:
        return "–"
    d = round(cur - prev, 1)
    if d == 0:
        return "0"
    sign = "+" if d > 0 else "–"
    mag = f"{abs(d):.1f}" if isinstance(cur, float) or isinstance(prev, float) else f"{abs(d):g}"
    if unit == "%":
        return f"{sign}{mag} pts"
    if not pct or abs(prev) < 5:  # a % change on a tiny base misleads, so show the absolute change only
        return f"{sign}{mag}"
    return f"{sign}{mag} ({sign}{abs(round(100 * d / prev))}%)"


def table(header: list[str], rows: list[list], widths: list[float], numeric_from: int = 1, total_row: bool = False) -> Table:
    data = [[Paragraph(h, S["head_r"] if i >= numeric_from else S["head"]) for i, h in enumerate(header)]]
    for row in rows:
        data.append([Paragraph(str(c), S["cell_r"] if i >= numeric_from else S["cell"]) for i, c in enumerate(row)])
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("LINEABOVE", (0, 0), (-1, 0), 0.9, colors.HexColor(INK)),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor(INK)),
        ("LINEBELOW", (0, -1), (-1, -1), 0.9, colors.HexColor(INK)),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, colors.HexColor(RULE)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.2),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    if total_row:
        style += [("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(SHADE))]
    t.setStyle(TableStyle(style))
    return t


def _section(n: int, title: str, *flow) -> list:
    return [KeepTogether([Paragraph(f"{n}.&nbsp;&nbsp;{title}", S["h1"]), *flow[:2]]), *flow[2:]]


# ---------- Words ----------

def findings(r: dict, alerts: list[dict] | None) -> list[str]:
    k, p, pl = r["kpis"], r["previous"], r["period"]["previousLabel"]
    out: list[str] = []
    if r["byCategory"] and k["received"]:
        top = r["byCategory"][0]
        out.append(f"{top['key']} complaints were the largest group: {top['count']} of {k['received']} "
                   f"({round(100 * top['count'] / k['received'])}%).")
    if k["medianResolutionDays"] is not None:
        line = f"Half of the cases resolved this period were closed within {k['medianResolutionDays']:g} days"
        line += f"; {k['resolvedWithin14d']}% within 14 days." if k["resolvedWithin14d"] is not None else "."
        out.append(line)
    if k["acceptanceRate"] is not None:
        out.append(f"{k['acceptanceRate']}% of forwarded cases were accepted by the receiving colleague "
                   f"({k['handoffsAccepted']} accepted, {k['handoffsRejected']} sent back).")
    if k["overdueEvents"]:
        out.append(f"{k['overdueEvents']} task deadlines were missed ({_change(k['overdueEvents'], p['overdueEvents'], False)} on {pl}); "
                   f"{k['escalations']} {'was' if k['escalations'] == 1 else 'were'} escalated to an administrator after 48 hours.")
    if alerts is not None:
        crit = [a for a in alerts if a["severity"] == "critical"]
        if crit:
            out.append(f"At the time of writing there {'is' if len(crit) == 1 else 'are'} {len(crit)} critical item"
                       f"{'' if len(crit) == 1 else 's'} outstanding, starting with {crit[0]['caseCode']} (section 6).")
    return out


DEFINITIONS = [
    ("Received", "cases whose received date falls in the period."),
    ("Resolved", "cases whose first move to the Resolved stage, as recorded in the audit log, falls in the period."),
    ("Time to resolve", "from the received date to that first resolution, in calendar days; median and mean are reported."),
    ("Open at period end", "cases received before the end of the period and not resolved by then (the backlog)."),
    ("Forward acceptance", "accepted forwards as a share of forwards decided (accepted or sent back) in the period."),
    ("Deadline missed", "an open task passing its due date, recorded once per deadline by the deadline watcher."),
    ("Escalation", "a task still open 48 hours after its due date; every administrator is notified."),
    ("Open risks", "critical and high alerts at the moment the report is generated; only shown for the current period."),
]


# ---------- Document ----------

def render_report_pdf(r: dict, alerts: list[dict] | None, generated_by: str) -> bytes:
    period = r["period"]
    yearly = period["kind"] == "year"
    start = datetime.fromisoformat(period["start"].replace("Z", "+00:00")).astimezone(local_tz())
    end = datetime.fromisoformat(period["end"].replace("Z", "+00:00")).astimezone(local_tz())
    tz = local_tz()
    generated = datetime.fromisoformat(r["generatedAt"].replace("Z", "+00:00")).astimezone(tz)
    in_progress = start <= generated < end
    k, p, pl = r["kpis"], r["previous"], period["previousLabel"]
    full_label = f"{start:%B %Y}" if not yearly else period["label"]

    def frame(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica-Bold", 7.5)
        canvas.setFillColor(colors.HexColor(INK))
        canvas.drawString(MARGIN, PAGE_H - 12 * mm, "THREAD")
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor(MUTED))
        canvas.drawString(MARGIN + 14 * mm, PAGE_H - 12 * mm, f"Complaint Handling Report · {full_label}")
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 12 * mm, "INTERNAL — CONFIDENTIAL")
        canvas.setStrokeColor(colors.HexColor(RULE))
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, PAGE_H - 14 * mm, PAGE_W - MARGIN, PAGE_H - 14 * mm)
        canvas.line(MARGIN, 15 * mm, PAGE_W - MARGIN, 15 * mm)
        canvas.drawString(MARGIN, 11 * mm, f"Generated {generated:%d %b %Y %H:%M} {generated:%Z} · Source: Thread case records and audit log")
        canvas.restoreState()

    story: list = [
        Paragraph("COMPLAINT HANDLING · " + ("ANNUAL REPORT" if yearly else "MONTHLY REPORT"), S["kicker"]),
        Paragraph("Complaint Handling Report", S["title"]),
        Paragraph(full_label + (" — year to date" if yearly and in_progress else ""), S["subtitle"]),
        Spacer(1, 5 * mm),
    ]
    meta = [
        ("Reporting period", f"{start:%d %B %Y} – {end - timedelta(days=1):%d %B %Y}"),
        ("Compared with", pl + (" (same point in the previous period, like for like)" if in_progress else "")),
        ("Prepared for", "Operations and Risk & Audit leadership"),
        ("Requested by", generated_by),
        ("Data as of", f"{generated:%d %B %Y, %H:%M} {generated:%Z}"),
    ]
    mt = Table([[Paragraph(a, S["meta_k"]), Paragraph(b, S["meta_v"])] for a, b in meta], colWidths=[34 * mm, CONTENT_W - 34 * mm])
    mt.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, 0), 0.9, colors.HexColor(INK)), ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor(RULE)),
                            ("TOPPADDING", (0, 0), (-1, -1), 1.6), ("BOTTOMPADDING", (0, 0), (-1, -1), 1.6), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    story.append(mt)
    if in_progress:
        story.append(Paragraph(f"The period is still in progress: figures cover {start:%d %B} to {generated:%d %B %Y} and will change.", S["note"]))
    story.append(Spacer(1, 3 * mm))

    # 1. Summary
    story += _section(1, "Summary", Paragraph(r["summary"], S["body"]))
    for f in findings(r, alerts):
        story.append(Paragraph(f, S["bullet"], bulletText="–"))

    # Key metrics
    metrics = [
        ("Complaints received", k["received"], p["received"], True, ""),
        ("Complaints resolved", k["resolved"], p["resolved"], True, ""),
        ("Open now (backlog)" if in_progress else "Open at period end (backlog)", k["openAtEnd"], p["openAtEnd"], True, ""),
        ("Median time to resolve (days)", k["medianResolutionDays"], p["medianResolutionDays"], False, ""),
        ("Mean time to resolve (days)", k["avgResolutionDays"], p["avgResolutionDays"], False, ""),
        ("Resolved within 14 days", k["resolvedWithin14d"], p["resolvedWithin14d"], False, "%"),
        ("Cases forwarded", k["handoffsSubmitted"], p["handoffsSubmitted"], True, ""),
        ("Forward acceptance rate", k["acceptanceRate"], p["acceptanceRate"], False, "%"),
        ("Deadlines missed", k["overdueEvents"], p["overdueEvents"], True, ""),
        ("Escalated to administrators", k["escalations"], p["escalations"], True, ""),
    ]
    rows = [[name, _num(v, u), _num(pv, u), _change(v, pv, pct, u)] for name, v, pv, pct, u in metrics]
    story += [Spacer(1, 2 * mm), KeepTogether([
        Paragraph("Table 1.&nbsp;&nbsp;Key metrics", S["head"]), Spacer(1, 1.5 * mm),
        table(["Metric", period["label"], pl, "Change"], rows, [CONTENT_W * 0.46, CONTENT_W * 0.16, CONTENT_W * 0.16, CONTENT_W * 0.22]),
    ])]

    # 2. Volume
    unit = "month" if yearly else "day"
    vol_text = (f"{k['received']} complaints were received and {k['resolved']} resolved in {period['label']}, against "
                f"{p['received']} and {p['resolved']} in {pl}. The backlog stood at {k['openAtEnd']} open cases {'at the time of writing' if in_progress else 'at the end of the period'}.")
    story += _section(2, "Volume and backlog", Paragraph(vol_text, S["body"]),
                      _image_with_caption(volume_chart(r, CONTENT_W / mm, 58), f"Figure 1. Complaints received and resolved per {unit}, {period['label']}."))
    story.append(KeepTogether([backlog_chart(r, CONTENT_W / mm, 46),
                               Paragraph(f"Figure 2. Open cases at the end of each {unit} (backlog), {period['label']}.", S["caption"])]))
    cats = r["byCategory"]
    if cats:
        total = sum(c["count"] for c in cats)
        crow = [[c["key"], c["count"], f"{round(100 * c['count'] / total)}%"] for c in cats] + [["Total", total, "100%"]]
        chan = {c["key"]: c["count"] for c in r["byChannel"]}
        story.append(KeepTogether([
            Paragraph("Table 2.&nbsp;&nbsp;Complaints received by category", S["head"]), Spacer(1, 1.5 * mm),
            table(["Category", "Complaints", "Share"], crow, [CONTENT_W * 0.6, CONTENT_W * 0.2, CONTENT_W * 0.2], total_row=True),
            Paragraph("Channels: " + ", ".join(f"{name.lower()} {n}" for name, n in chan.items()) + ".", S["note"]),
        ]))

    # 3. Resolution
    res_rows = [
        ["Resolved in period", _num(k["resolved"]), _num(p["resolved"])],
        ["Median time to resolve (days)", _num(k["medianResolutionDays"]), _num(p["medianResolutionDays"])],
        ["Mean time to resolve (days)", _num(k["avgResolutionDays"]), _num(p["avgResolutionDays"])],
        ["Share resolved within 14 days", _num(k["resolvedWithin14d"], "%"), _num(p["resolvedWithin14d"], "%")],
    ]
    gap = ""
    if k["medianResolutionDays"] is not None and k["avgResolutionDays"] is not None and k["avgResolutionDays"] > k["medianResolutionDays"] * 1.3:
        gap = " The mean is well above the median, which means a small number of long-running cases are pulling the average up."
    story += _section(3, "Resolution performance",
                      Paragraph("Time to resolve is measured from the date a complaint is received to its first move to the Resolved stage." + gap, S["body"]),
                      table(["Measure", period["label"], pl], res_rows, [CONTENT_W * 0.56, CONTENT_W * 0.22, CONTENT_W * 0.22]))

    # 4. Handoffs
    ho_rows = [
        ["Cases forwarded", _num(k["handoffsSubmitted"]), _num(p["handoffsSubmitted"])],
        ["Accepted / sent back", f"{k['handoffsAccepted']} / {k['handoffsRejected']}", f"{p['handoffsAccepted']} / {p['handoffsRejected']}"],
        ["Acceptance rate", _num(k["acceptanceRate"], "%"), _num(p["acceptanceRate"], "%")],
        ["Mean wait before acceptance (hours)", _num(k["avgAcceptHours"]), _num(p["avgAcceptHours"])],
        ["Administrator reassignments", _num(k["forcedReassignments"]), _num(p["forcedReassignments"])],
    ]
    story += _section(4, "Handoffs between colleagues",
                      Paragraph("A forward only completes when the receiver has acknowledged all five sections of the case and no questions are open.", S["body"]),
                      table(["Measure", period["label"], pl], ho_rows, [CONTENT_W * 0.56, CONTENT_W * 0.22, CONTENT_W * 0.22]))

    # 5. Deadlines
    dl_text = (f"{k['overdueEvents']} task deadlines were missed in the period ({_change(k['overdueEvents'], p['overdueEvents'], False)} on {pl}) "
               f"and {k['tasksCompleted']} tasks were completed. {k['escalations']} missed deadlines reached the 48-hour escalation point.")
    story += _section(5, "Deadlines and escalations", Paragraph(dl_text, S["body"]))

    # Team
    people = [[x["name"], x["department"], x["openCases"], x["resolved"], x["handoffsSent"], x["tasksCompleted"], x["overdueNow"]] for x in r["people"]]
    if people:
        story.append(KeepTogether([
            Spacer(1, 2 * mm), Paragraph("Table 3.&nbsp;&nbsp;Activity by employee", S["head"]), Spacer(1, 1.5 * mm),
            table(["Employee", "Department", "Open now", "Resolved", "Forwarded", "Tasks done", "Overdue now"], people,
                  [CONTENT_W * 0.22, CONTENT_W * 0.22] + [CONTENT_W * 0.112] * 5, numeric_from=2),
            Paragraph("Resolved, Forwarded and Tasks done count activity in the period; Open now and Overdue now are as at the time of generation.", S["note"]),
        ]))

    # 6. Open risks
    if alerts is not None:
        top = [a for a in alerts if a["severity"] in ("critical", "high")][:8]
        risk = table(["Severity", "Item", "Case", "Responsible"],
                     [[a["severity"].capitalize(), a["title"], a["caseCode"], a["detail"].split(" · ")[-1]] for a in top],
                     [CONTENT_W * 0.13, CONTENT_W * 0.52, CONTENT_W * 0.14, CONTENT_W * 0.21], numeric_from=4) if top else None
        story += _section(6, "Open risks at the time of reporting",
                          Paragraph("Critical items are tasks more than 48 hours past their deadline; high items are tasks past their deadline." if top
                                    else "There were no critical or high items outstanding when this report was generated.", S["body"]),
                          *( [risk] if risk else []))

    # Appendix
    story += [Spacer(1, 4 * mm), KeepTogether([
        Paragraph("Appendix A.&nbsp;&nbsp;Definitions and method", S["h1"]),
        *[Paragraph(f"<b>{term}</b> — {text}", S["def"]) for term, text in DEFINITIONS],
        Paragraph("All figures are computed from Thread's case records and its append-only audit log at the time of generation. "
                  f"Dates and periods are in {tz.key} time ({generated:%Z}). Figures for a period in progress are provisional.", S["note"]),
    ])]

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=20 * mm, bottomMargin=20 * mm,
                            title=f"Complaint Handling Report — {full_label}", author="Thread", subject="Complaint handling report")
    doc.build(story, onFirstPage=frame, onLaterPages=frame, canvasmaker=NumberedCanvas)
    return buf.getvalue()


def _image_with_caption(img: Image, caption: str) -> KeepTogether:
    return KeepTogether([img, Paragraph(caption, S["caption"])])
