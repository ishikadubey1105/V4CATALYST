from datetime import datetime, timedelta, timezone

from app import models as m
from app.db import SessionLocal
from app.deadlines import run_deadline_watcher
from app.seed_history import seed_history


def alerts(client, h):
    r = client.get("/api/alerts", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def by_link(items):
    return {a["link"].split("highlight=")[-1] if "highlight=" in a["link"] else a["link"]: a for a in items}


# ---------- Alerts ----------

def test_alert_severity_and_scope(client, login):
    # Seed: t9 overdue ~1 day (c5), t10 overdue ~2 days (c5) -> critical, t7 due in ~20h (c3)
    neha = by_link(alerts(client, login("neha.kulkarni"))["alerts"])  # owns c5, assignee of t9
    assert neha["t9"]["kind"] == "task_overdue" and neha["t9"]["severity"] == "high"
    assert neha["t10"]["severity"] == "critical"  # past the 48h escalation window
    assert "t7" not in neha  # not her case or task

    asha = alerts(client, login("asha.rao"))
    assert by_link(asha["alerts"])["t7"]["kind"] == "task_due_soon"
    assert all(a["caseCode"] != "CMP-1019" for a in asha["alerts"])  # c5 is not hers

    admin = alerts(client, login("meera.iyer"))
    links = by_link(admin["alerts"])
    assert {"t7", "t9", "t10"} <= set(links)
    assert admin["counts"]["critical"] >= 1
    # most severe first
    ranks = [{"critical": 0, "high": 1, "warning": 2, "info": 3}[a["severity"]] for a in admin["alerts"]]
    assert ranks == sorted(ranks)


def test_completing_task_clears_alert(client, login):
    neha = login("neha.kulkarni")
    assert client.patch("/api/tasks/t9", json={"done": True}, headers=neha).status_code == 200
    assert "t9" not in by_link(alerts(client, neha)["alerts"])


def test_waiting_handoff_and_question_alerts(client, login):
    with SessionLocal() as db:  # age the seeded forward (6h) and question (1 day) past their thresholds
        db.get(m.Handoff, "h1").created_at = m.now() - timedelta(hours=30)
        db.get(m.Question, "q1").at = m.now() - timedelta(hours=60)
        db.commit()
    ravi = alerts(client, login("ravi.menon"))["alerts"]  # receiver of h1
    assert any(a["kind"] == "handoff_waiting" and a["link"] == "/handoffs/h1" for a in ravi)
    asha = alerts(client, login("asha.rao"))["alerts"]  # owns c1, where q1 is waiting
    assert any(a["kind"] == "question_unanswered" and a["caseCode"] == "CMP-1042" for a in asha)


# ---------- Background reminders and escalation ----------

def test_watcher_reminds_escalates_once(client, login):
    with SessionLocal() as db:
        db.get(m.Handoff, "h1").created_at = m.now() - timedelta(hours=30)
        db.commit()
        run_deadline_watcher(db)
        run_deadline_watcher(db)  # second run must not duplicate anything

    def kinds(user):
        return [n["kind"] for n in client.get("/api/sync", headers=login(user)).json()["notifications"]]

    for admin in ("meera.iyer", "arjun.shah"):
        assert kinds(admin).count("escalation") == 1  # only t10 is past 48h
    assert kinds("asha.rao").count("reminder") == 1  # t7 due within 24h
    assert kinds("ravi.menon").count("reminder") == 1  # h1 waiting > 24h
    audit = client.get("/api/sync", headers=login("arjun.shah")).json()["audit"]
    assert sum(a["action"] == "deadline.escalated" for a in audit) == 1


def test_new_deadline_rearms_reminders(client, login):
    with SessionLocal() as db:
        run_deadline_watcher(db)
    neha = login("neha.kulkarni")
    soon = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat().replace("+00:00", "Z")
    assert client.patch("/api/tasks/t9", json={"due": soon}, headers=neha).status_code == 200
    with SessionLocal() as db:
        t = db.get(m.Task, "t9")
        assert not (t.overdue_notified or t.due_soon_notified or t.escalated)
        run_deadline_watcher(db)
    notes = client.get("/api/sync", headers=neha).json()["notifications"]
    assert any(n["kind"] == "reminder" and "t9" in n["link"] for n in notes)


# ---------- Reports ----------

def report(client, h, **params):
    return client.get("/api/reports/summary", params=params, headers=h)


def test_report_access(client, login):
    assert report(client, login("asha.rao")).json()["code"] == "FORBIDDEN"
    assert report(client, login("meera.iyer"), period="year", month=3).json()["code"] == "BAD_REQUEST"
    assert report(client, login("meera.iyer"), period="month", month=13).status_code == 422


def test_month_report_counts_activity(client, login):
    admin, asha = login("meera.iyer"), login("asha.rao")
    before = report(client, admin).json()
    now = datetime.now(timezone.utc)
    assert before["period"]["kind"] == "month" and len(before["trend"]) in (28, 29, 30, 31)

    # Register one complaint and resolve another this month
    body = {"title": "Report test complaint", "complainant": "Acme", "channel": "Phone", "category": "Billing",
            "priority": "high", "summary": "Charged twice for the same order last week.", "ownerId": "e1"}
    assert client.post("/api/cases", json=body, headers=asha).status_code == 200
    for t in ("t7", "t8"):
        client.patch(f"/api/tasks/{t}", json={"done": True}, headers=asha)
    assert client.patch("/api/cases/c3/stage", json={"stage": "resolved"}, headers=asha).status_code == 200

    after = report(client, admin).json()
    k, k0 = after["kpis"], before["kpis"]
    assert k["received"] == k0["received"] + 1 and k["resolved"] == k0["resolved"] + 1
    assert k["tasksCompleted"] == k0["tasksCompleted"] + 2
    assert after["trend"][now.day - 1]["received"] >= 1 and after["trend"][now.day - 1]["resolved"] >= 1
    assert any(b["key"] == "Billing" for b in after["byCategory"])
    asha_row = next(p for p in after["people"] if p["employeeId"] == "e1")
    assert asha_row["resolved"] >= 1 and asha_row["tasksCompleted"] >= 2
    assert "resolved" in after["summary"] and after["period"]["label"] in after["summary"]


def test_year_report_with_history(client, login):
    with SessionLocal() as db:
        added = seed_history(db)
        assert added > 30 and seed_history(db) == 0  # deterministic, refuses to run twice
    now = datetime.now(timezone.utc)
    r = report(client, login("arjun.shah"), period="year", year=now.year).json()
    assert len(r["trend"]) == 12 and r["period"]["label"] == str(now.year)
    total_received = sum(b["received"] for b in r["trend"])
    assert total_received == r["kpis"]["received"] and r["kpis"]["resolved"] > 0
    assert r["kpis"]["avgResolutionDays"] is not None and r["kpis"]["acceptanceRate"] is not None
    assert r["previous"]["received"] >= 0 and r["period"]["previousLabel"].startswith(str(now.year - 1))  # like-for-like: "2025 to 12 Oct"


def test_report_pdf(client, login):
    admin = login("meera.iyer")
    r = client.get("/api/reports/summary.pdf", params={"period": "month"}, headers=admin)
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF") and len(r.content) > 10_000
    assert 'filename="thread-report-' in r.headers["content-disposition"]
    year = client.get("/api/reports/summary.pdf", params={"period": "year", "year": 2025}, headers=admin)
    assert year.status_code == 200 and 'thread-report-2025.pdf' in year.headers["content-disposition"]
    assert client.get("/api/reports/summary.pdf", headers=login("asha.rao")).json()["code"] == "FORBIDDEN"
    audit = client.get("/api/sync", headers=admin).json()["audit"]
    assert sum(a["action"] == "report.exported" for a in audit) == 2
    # in-page preview: inline, and not counted as a download
    preview = client.get("/api/reports/summary.pdf", params={"period": "week", "download": "false"}, headers=admin)
    assert preview.status_code == 200 and preview.headers["content-disposition"].startswith("inline")
    audit = client.get("/api/sync", headers=admin).json()["audit"]
    assert sum(a["action"] == "report.exported" for a in audit) == 2


def test_week_report_lists_registered_and_closed_cases(client, login):
    admin, asha = login("meera.iyer"), login("asha.rao")
    body = {"title": "Weekly report complaint", "complainant": "Acme", "channel": "Email", "category": "Billing",
            "priority": "medium", "summary": "Invoice shows the wrong tax rate for October.", "ownerId": "e1"}
    code = client.post("/api/cases", json=body, headers=asha).json()["code"]
    for t in ("t7", "t8"):
        client.patch(f"/api/tasks/{t}", json={"done": True}, headers=asha)
    assert client.patch("/api/cases/c3/stage", json={"stage": "resolved"}, headers=asha).status_code == 200

    r = report(client, admin, period="week").json()
    y, w, _ = datetime.now(timezone.utc).isocalendar()
    assert r["period"]["kind"] == "week" and r["period"]["week"] == w and r["period"]["label"] == f"Week {w}, {y}"
    assert len(r["trend"]) == 7 and r["trend"][0]["label"].startswith("Mon")
    assert any(c["code"] == code for c in r["casesRegistered"])
    closed = next(c for c in r["casesClosed"] if c["id"] == "c3")
    assert closed["resolvedBy"] == "Asha Rao" and closed["daysToResolve"] >= 0
    assert r["kpis"]["received"] == len(r["casesRegistered"]) and r["kpis"]["resolved"] == len(r["casesClosed"])
    assert r["period"]["previousLabel"].startswith(f"Week {(datetime.now(timezone.utc) - timedelta(days=7)).isocalendar()[1]}")

    prev = report(client, admin, period="week", year=2025, week=52).json()
    assert prev["period"]["start"].startswith("2025-12-22") and not prev["period"]["inProgress"]
    assert report(client, admin, period="week", year=2025, week=53).json()["code"] == "BAD_REQUEST"  # 2025 has 52 ISO weeks
    assert report(client, admin, period="month", week=3).json()["code"] == "BAD_REQUEST"
    pdf = client.get("/api/reports/summary.pdf", params={"period": "week"}, headers=admin)
    assert pdf.status_code == 200 and f"thread-report-{y}-W{w:02d}.pdf" in pdf.headers["content-disposition"]


def test_csv_export_and_download_metric(client, login):
    admin = login("meera.iyer")
    assert client.get("/api/reports/downloads", headers=login("asha.rao")).json()["code"] == "FORBIDDEN"
    assert client.get("/api/reports/downloads", headers=admin).json()["total"] == 0

    r = client.get("/api/reports/summary.csv", params={"period": "week"}, headers=admin)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    text = r.content.decode("utf-8-sig")
    assert text.startswith("Thread complaint report") and "Cases registered" in text and "Cases closed" in text
    assert "Reports downloaded" in text and "Complaints registered" in text
    client.get("/api/reports/summary.pdf", params={"period": "month"}, headers=admin)

    d = client.get("/api/reports/downloads", headers=admin).json()
    assert d["total"] == 2 and d["thisWeek"] == 2 and d["thisMonth"] == 2
    assert {b["key"]: b["count"] for b in d["byFormat"]} == {"PDF": 1, "CSV": 1}
    assert d["recent"][0]["by"] == "Meera Iyer" and d["recent"][0]["format"] == "PDF"
    assert report(client, admin, period="week").json()["kpis"]["reportsDownloaded"] == 2
