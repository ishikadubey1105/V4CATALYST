import json
from types import SimpleNamespace

import pytest

from app import ai
from app.config import settings


class FakeClaude:
    """Stands in for anthropic.Anthropic: records the request, returns a canned reply."""

    def __init__(self, payload=None, stop_reason="end_turn"):
        self.calls = []
        self.payload = payload
        self.stop_reason = stop_reason
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        content = [] if self.stop_reason == "refusal" else [SimpleNamespace(type="text", text=json.dumps(self.payload))]
        return SimpleNamespace(stop_reason=self.stop_reason, content=content, model=kwargs["model"])


DRAFT = {"text": "Ravi, the carrier rollback is pending.", "urgent": ["Chase carrier"], "risks": ["Overdue logs"], "gaps": []}


@pytest.fixture()
def no_key(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", None)


def test_draft_without_key_uses_template(client, login, no_key):
    r = client.post("/api/cases/c1/ai/handoff-draft", json={"toId": "e2", "reason": "workload"}, headers=login("asha.rao"))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["source"] == "template" and "ANTHROPIC_API_KEY" in d["note"]
    assert d["text"].startswith("Ravi,") and "CMP-1042" in d["text"]
    # c1's real gaps: t2 unassigned, t3 undated
    assert any("Send remediation plan" in g for g in d["gaps"]) and any("credit note" in g for g in d["gaps"])


def test_ai_permissions(client, login, no_key):
    assert client.post("/api/cases/c1/ai/handoff-draft", json={}, headers=login("ravi.menon")).json()["code"] == "FORBIDDEN"
    assert client.post("/api/handoffs/h1/ai/brief", headers=login("neha.kulkarni")).json()["code"] == "FORBIDDEN"  # sender, not receiver
    r = client.post("/api/handoffs/h1/ai/brief", headers=login("ravi.menon"))
    assert r.status_code == 200 and r.json()["source"] == "template" and "CMP-1038" in r.json()["text"]


def test_draft_with_claude(client, login, monkeypatch):
    fake = FakeClaude(DRAFT)
    monkeypatch.setattr(ai, "_client", lambda: fake)
    r = client.post("/api/cases/c1/ai/handoff-draft", json={"toId": "e2", "reason": "workload", "reasonNote": "Rebalancing"}, headers=login("asha.rao"))
    d = r.json()
    assert d["source"] == "claude" and d["model"] == "claude-opus-5-5" and d["text"] == DRAFT["text"] and "note" not in d

    req = fake.calls[0]
    assert req["model"] == "claude-opus-5-5" and req["fallbacks"] == "default"
    assert req["betas"] == ["server-side-fallback-2026-07-01"]
    assert req["output_config"]["format"]["type"] == "json_schema"
    prompt = req["messages"][0]["content"]
    # The case record goes in as data, with the facts the template would use
    assert "<case_record>" in prompt and "CMP-1042" in prompt and "UNASSIGNED" in prompt and "Ravi Menon" in prompt
    audit = client.get("/api/sync", headers=login("meera.iyer")).json()["audit"]
    assert any(a["action"] == "ai.handoff_drafted" and "(claude)" in a["detail"] for a in audit)


def test_refusal_falls_back_to_template(client, login, monkeypatch):
    monkeypatch.setattr(ai, "_client", lambda: FakeClaude(stop_reason="refusal"))
    d = client.post("/api/handoffs/h1/ai/brief", headers=login("ravi.menon")).json()
    assert d["source"] == "template" and "could not answer" in d["note"]
