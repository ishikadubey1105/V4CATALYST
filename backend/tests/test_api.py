from datetime import datetime, timedelta, timezone

from app import models as m
from app.config import settings
from app.db import SessionLocal
from app.deadlines import run_deadline_watcher

SNAPSHOT_KEYS = {"employees", "cases", "notes", "decisions", "docs", "tasks", "questions", "handoffs", "ownership", "notifications", "audit"}


def err(r):
    return r.status_code, r.json()["code"]


def snap(client, h):
    r = client.get("/api/sync", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def future(days=3):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat().replace("+00:00", "Z")


# ---------- Auth ----------

def test_login_errors_and_lockout(client, login):
    assert err(client.post("/api/auth/login", json={"username": "someone.else", "password": "x"})) == (401, "INVALID_USER")
    for _ in range(4):
        assert err(client.post("/api/auth/login", json={"username": "asha.rao", "password": "wrong"})) == (401, "INVALID_PASSWORD")
    assert err(client.post("/api/auth/login", json={"username": "asha.rao", "password": "wrong"})) == (401, "ACCOUNT_LOCKED")
    # Even the right password is refused while locked
    assert err(client.post("/api/auth/login", json={"username": "asha.rao", "password": "Asha@2026"})) == (401, "ACCOUNT_LOCKED")

    admin = login("meera.iyer")
    assert snap(client, admin)["failedLogins"] == {"asha.rao": 5}
    assert client.patch("/api/employees/e1", json={"active": True}, headers=admin).status_code == 200  # "Unlock"
    login("asha.rao")


def test_login_response_and_logout(client):
    r = client.post("/api/auth/login", json={"username": "ASHA.RAO", "password": "Asha@2026"})
    body = r.json()
    assert body["user"]["id"] == "e1" and "password" not in str(body["user"]).lower()
    h = {"Authorization": f"Bearer {body['token']}"}
    assert client.post("/api/auth/logout", headers=h).json() == {"ok": True}
    assert err(client.get("/api/sync", headers=h)) == (401, "UNAUTHENTICATED")
    assert err(client.get("/api/sync")) == (401, "UNAUTHENTICATED")


def test_disabled_account(client, login):
    admin = login("meera.iyer")
    ravi = login("ravi.menon")
    assert client.patch("/api/employees/e2", json={"active": False}, headers=admin).status_code == 200
    assert err(client.get("/api/sync", headers=ravi)) == (401, "UNAUTHENTICATED")  # existing session killed
    assert err(client.post("/api/auth/login", json={"username": "ravi.menon", "password": "Ravi@2026"})) == (401, "ACCOUNT_DISABLED")


# ---------- Visibility ----------

def test_sync_visibility(client, login):
    asha = snap(client, login("asha.rao"))
    assert SNAPSHOT_KEYS <= asha.keys()
    # owner of c1, c3; nothing connects her to c2, c4, c5, c6
    assert {c["id"] for c in asha["cases"]} == {"c1", "c3"}
    assert {t["caseId"] for t in asha["tasks"]} <= {"c1", "c3"}
    assert all(n["userId"] == "e1" for n in asha["notifications"])
    assert asha["failedLogins"] == {}

    karan = snap(client, login("karan.joshi"))  # owner c6, open tasks on c1 + c5
    assert {c["id"] for c in karan["cases"]} == {"c1", "c5", "c6"}

    ravi = snap(client, login("ravi.menon"))  # receiver of h1 (c2), owner c4, task on c3
    assert {c["id"] for c in ravi["cases"]} == {"c2", "c3", "c4"}

    admin = snap(client, login("meera.iyer"))
    assert len(admin["cases"]) == 6


def test_access_denied_is_logged(client, login):
    asha = login("asha.rao")
    assert err(client.get("/api/cases/c5", headers=asha)) == (403, "FORBIDDEN")
    audit = snap(client, login("arjun.shah"))["audit"]
    assert any(a["action"] == "access.denied" and a["caseId"] == "c5" and a["actorId"] == "e1" for a in audit)


def test_case_shape_matches_frontend(client, login):
    c2 = next(c for c in snap(client, login("meera.iyer"))["cases"] if c["id"] == "c2")
    assert c2["prevStage"] == "action" and c2["receivedAt"].endswith("Z")
    c1 = next(c for c in snap(client, login("meera.iyer"))["cases"] if c["id"] == "c1")
    assert "prevStage" not in c1  # optional fields are omitted, not null


# ---------- Demo script: forward CMP-1042 from Asha to Ravi ----------

def test_full_handoff_flow(client, login):
    asha = login("asha.rao")
    draft = {"toId": "e2", "reason": "workload", "reasonNote": "Rebalancing Customer Relations queue", "summary": "Carrier rollback is pending; remediation plan is drafted and needs sending."}

    r = client.post("/api/cases/c1/handoffs", json=draft, headers=asha)
    assert err(r) == (422, "INCOMPLETE_HANDOFF")

    # Fix each gap: assign t2, date t3, answer q1
    assert client.patch("/api/tasks/t2", json={"ownerId": "e1"}, headers=asha).status_code == 200
    assert client.patch("/api/tasks/t3", json={"due": future()}, headers=asha).status_code == 200
    assert client.post("/api/questions/q1/answer", json={"answer": "Yes, emailed on Monday."}, headers=asha).status_code == 200

    r = client.post("/api/cases/c1/handoffs", json=draft, headers=asha)
    assert r.status_code == 200, r.text
    h = r.json()
    assert h["status"] == "submitted" and h["acks"] == dict.fromkeys(["overview", "context", "documents", "actions", "questions"], False)

    # Case is in handoff: stage moves blocked
    assert err(client.patch("/api/cases/c1/stage", json={"stage": "action"}, headers=asha)) == (409, "STAGE_BLOCKED")

    ravi = login("ravi.menon")
    assert any(c["id"] == "c1" for c in snap(client, ravi)["cases"])  # receiver can now see it
    assert err(client.post(f"/api/handoffs/{h['id']}/acks", json={"section": "overview", "value": True}, headers=asha)) == (403, "FORBIDDEN")
    assert err(client.post(f"/api/handoffs/{h['id']}/accept", headers=ravi)) == (409, "NOT_ACKNOWLEDGED")

    for s in ["overview", "context", "documents", "actions", "questions"]:
        assert client.post(f"/api/handoffs/{h['id']}/acks", json={"section": s, "value": True}, headers=ravi).status_code == 200

    # An open question blocks acceptance
    assert client.post("/api/cases/c1/questions", json={"text": "Who signs the credit note?", "handoffId": h["id"]}, headers=ravi).status_code == 200
    assert err(client.post(f"/api/handoffs/{h['id']}/accept", headers=ravi)) == (409, "OPEN_QUESTIONS")
    q = next(q for q in snap(client, asha)["questions"] if q["text"] == "Who signs the credit note?")
    assert client.post(f"/api/questions/{q['id']}/answer", json={"answer": "Finance lead."}, headers=asha).status_code == 200

    r = client.post(f"/api/handoffs/{h['id']}/accept", headers=ravi)
    assert r.status_code == 200 and r.json()["status"] == "accepted"

    s = snap(client, ravi)
    c1 = next(c for c in s["cases"] if c["id"] == "c1")
    assert c1["ownerId"] == "e2" and c1["stage"] == "investigation" and "prevStage" not in c1
    chain = [o for o in s["ownership"] if o["caseId"] == "c1"]
    assert chain[-1]["userId"] == "e2" and chain[-1]["via"] == "handoff" and "to" in chain[-2]
    assert any(n["kind"] == "accepted" for n in snap(client, asha)["notifications"])
    # Asha is now a previous owner: still sees it, can no longer edit it
    assert err(client.post("/api/cases/c1/notes", json={"title": "x", "body": "y"}, headers=asha)) == (403, "FORBIDDEN")


def test_reject_handoff(client, login):
    ravi = login("ravi.menon")
    r = client.post("/api/handoffs/h1/reject", json={"reason": "I'm also on leave next week."}, headers=ravi)
    assert r.status_code == 200 and r.json()["rejectReason"] == "I'm also on leave next week."
    c2 = next(c for c in snap(client, login("neha.kulkarni"))["cases"] if c["id"] == "c2")
    assert c2["stage"] == "action" and c2["ownerId"] == "e5"
    assert err(client.post("/api/handoffs/h1/accept", headers=ravi)) == (409, "HANDOFF_CLOSED")


# ---------- Stages, tasks, permissions ----------

def test_stage_rules(client, login):
    asha = login("asha.rao")
    assert err(client.patch("/api/cases/c3/stage", json={"stage": "handoff"}, headers=asha)) == (409, "STAGE_BLOCKED")
    assert err(client.patch("/api/cases/c3/stage", json={"stage": "resolved"}, headers=asha)) == (409, "STAGE_BLOCKED")
    for t in ("t7", "t8"):
        assert client.patch(f"/api/tasks/{t}", json={"done": True}, headers=asha).status_code == 200
    r = client.patch("/api/cases/c3/stage", json={"stage": "resolved"}, headers=asha)
    assert r.status_code == 200 and r.json()["stage"] == "resolved"
    assert err(client.patch("/api/cases/c4/stage", json={"stage": "investigation"}, headers=asha)) == (403, "FORBIDDEN")


def test_task_permissions(client, login):
    karan = login("karan.joshi")  # assignee of t1 on c1, not the owner
    assert client.patch("/api/tasks/t1", json={"done": True}, headers=karan).status_code == 200
    assert err(client.patch("/api/tasks/t1", json={"due": future()}, headers=karan)) == (403, "FORBIDDEN")
    asha = login("asha.rao")
    assert client.patch("/api/tasks/t3", json={"ownerId": None}, headers=asha).json().get("ownerId") is None  # null clears
    assert err(client.patch("/api/tasks/t3", json={"ownerId": "nobody"}, headers=asha)) == (404, "NOT_FOUND")


def test_create_case_and_notifications(client, login):
    asha = login("asha.rao")
    body = {"title": "Wrong item shipped", "complainant": "Acme", "channel": "Email", "category": "Delivery", "priority": "low", "summary": "Sent size M instead of L.", "ownerId": "e2"}
    short = {**body, "summary": "ETEREDTETETERTERTET"}  # 19 chars — the form requires 20
    assert err(client.post("/api/cases", json=short, headers=asha)) == (422, "VALIDATION_ERROR")
    body["summary"] = "Sent size M instead of L; customer wants an exchange."
    r = client.post("/api/cases", json=body, headers=asha)
    assert r.status_code == 200 and r.json()["code"] == "CMP-1043" and r.json()["stage"] == "received"

    ravi = login("ravi.menon")
    notes = [n for n in snap(client, ravi)["notifications"] if n["kind"] == "assigned"]
    assert notes and not notes[0]["read"]
    assert client.post(f"/api/notifications/{notes[0]['id']}/read", headers=ravi).json() == {"ok": True}
    assert client.post("/api/notifications/read-all", headers=ravi).json() == {"ok": True}
    assert all(n["read"] for n in snap(client, ravi)["notifications"])
    # someone else's notification looks like it doesn't exist
    assert err(client.post("/api/notifications/nt2/read", headers=ravi)) == (404, "NOT_FOUND")


def test_auditor_is_read_only(client, login):
    admin = login("meera.iyer")
    r = client.post("/api/employees", json={"username": "audit.one", "name": "Audit One", "email": "audit.one@corp.local", "department": "Risk", "title": "Auditor", "orgRole": "auditor"}, headers=admin)
    assert r.status_code == 200
    auditor = login("audit.one", r.json()["tempPassword"])
    assert len(snap(client, auditor)["cases"]) == 6
    assert err(client.post("/api/cases/c1/questions", json={"text": "?"}, headers=auditor)) == (403, "FORBIDDEN")
    assert err(client.post("/api/cases/c1/notes", json={"title": "t", "body": "b"}, headers=auditor)) == (403, "FORBIDDEN")


# ---------- Admin ----------

def test_admin_employees_and_reassign(client, login):
    admin = login("meera.iyer")
    new = {"username": "dev.patel", "name": "Dev Patel", "email": "Dev.Patel@corp.local", "department": "Ops", "title": "Analyst", "orgRole": "employee"}
    r = client.post("/api/employees", json=new, headers=admin)
    assert r.status_code == 200 and r.json()["tempPassword"].startswith("Temp-")
    assert err(client.post("/api/employees", json=new, headers=admin)) == (409, "USERNAME_TAKEN")
    assert err(client.post("/api/employees", json={**new, "username": "dev.p2"}, headers=admin)) == (409, "EMAIL_TAKEN")
    assert err(client.patch("/api/employees/e3", json={"orgRole": "employee"}, headers=admin)) == (403, "FORBIDDEN")  # self
    assert err(client.post("/api/employees", json=new, headers=login("asha.rao"))) == (403, "FORBIDDEN")

    # Reassign c2 (mid-handoff): pending forward is superseded, stage restored
    r = client.post("/api/cases/c2/reassign", json={"toId": "e1", "reason": "Neha out sick"}, headers=admin)
    assert r.status_code == 200 and r.json()["ownerId"] == "e1" and r.json()["stage"] == "action"
    s = snap(client, admin)
    assert next(h for h in s["handoffs"] if h["id"] == "h1")["status"] == "rejected"
    assert any(a["action"] == "handoff.forced" for a in s["audit"])
    assert err(client.post("/api/cases/c3/reassign", json={"toId": "e2", "reason": "x"}, headers=login("asha.rao"))) == (403, "FORBIDDEN")


def test_upload_documents(client, login):
    asha = login("asha.rao")
    files = [("files", ("evidence.pdf", b"%PDF-1.4 hello", "application/pdf")), ("files", ("../../photo.PNG", b"\x89PNG", "image/png"))]
    assert client.post("/api/cases/c3/documents", files=files, headers=asha).json() == {"ok": True}
    docs = [d for d in snap(client, asha)["docs"] if d["caseId"] == "c3"]
    added = {d["name"]: d for d in docs}
    assert added["evidence.pdf"]["kind"] == "pdf" and added["evidence.pdf"]["size"] == 14
    assert added["photo.PNG"]["kind"] == "image"  # path components stripped
    r = client.get(f"/api/documents/{added['evidence.pdf']['id']}/download", headers=asha)
    assert r.status_code == 200 and r.content == b"%PDF-1.4 hello"
    with SessionLocal() as db:  # stored in the database, not on the server's disk
        d = db.get(m.Document, added["evidence.pdf"]["id"])
        assert d.content == b"%PDF-1.4 hello" and d.storage_path is None


def test_upload_size_limit(client, login, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_bytes", 10)
    r = client.post("/api/cases/c3/documents", files=[("files", ("big.txt", b"x" * 11, "text/plain"))], headers=login("asha.rao"))
    assert r.status_code == 413 and r.json()["code"] == "FILE_TOO_LARGE"
    assert not [d for d in snap(client, login("asha.rao"))["docs"] if d["name"] == "big.txt"]


def test_deadline_watcher_notifies_once(client, login):
    with SessionLocal() as db:
        assert run_deadline_watcher(db) == 2  # t9, t10 on c5
        assert run_deadline_watcher(db) == 0
    neha = snap(client, login("neha.kulkarni"))  # owns c5, assignee of t9
    assert sum(n["kind"] == "overdue" for n in neha["notifications"]) == 2
    karan = snap(client, login("karan.joshi"))  # assignee of t10
    assert sum(n["kind"] == "overdue" for n in karan["notifications"]) == 1


def test_validation_error_shape(client, login):
    r = client.post("/api/cases/c1/tasks", json={"title": ""}, headers=login("asha.rao"))
    assert r.status_code == 422 and r.json()["code"] == "VALIDATION_ERROR" and "message" in r.json()
