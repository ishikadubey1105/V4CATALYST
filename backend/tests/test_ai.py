def test_draft_is_built_locally_from_the_record(client, login):
    r = client.post("/api/cases/c1/ai/handoff-draft", json={"toId": "e2", "reason": "workload"}, headers=login("asha.rao"))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["source"] == "local" and "note" not in d and "model" not in d
    assert d["text"].startswith("Ravi,") and "CMP-1042" in d["text"]
    # c1's real gaps: t2 unassigned, t3 undated
    assert any("Send remediation plan" in g for g in d["gaps"]) and any("credit note" in g for g in d["gaps"])
    audit = client.get("/api/sync", headers=login("meera.iyer")).json()["audit"]
    assert any(a["action"] == "ai.handoff_drafted" and "(local)" in a["detail"] for a in audit)


def test_draft_is_deterministic(client, login):
    h = login("asha.rao")
    a = client.post("/api/cases/c1/ai/handoff-draft", json={"toId": "e2"}, headers=h).json()
    b = client.post("/api/cases/c1/ai/handoff-draft", json={"toId": "e2"}, headers=h).json()
    assert a == b


def test_ai_permissions(client, login):
    assert client.post("/api/cases/c1/ai/handoff-draft", json={}, headers=login("ravi.menon")).json()["code"] == "FORBIDDEN"
    assert client.post("/api/handoffs/h1/ai/brief", headers=login("neha.kulkarni")).json()["code"] == "FORBIDDEN"  # sender, not receiver
    r = client.post("/api/handoffs/h1/ai/brief", headers=login("ravi.menon"))
    assert r.status_code == 200 and r.json()["source"] == "local" and "CMP-1038" in r.json()["text"]
