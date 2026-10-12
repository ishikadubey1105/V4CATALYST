import json
from types import SimpleNamespace

import pytest

from app import ai
from app.config import settings


class FakeGroq:
    """Stands in for groq.Groq: records the chat-completion request, returns a canned reply."""

    def __init__(self, content=None, finish_reason="stop"):
        self.calls = []
        self.content = content
        self.finish_reason = finish_reason
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        message = SimpleNamespace(content=self.content if isinstance(self.content, str) or self.content is None else json.dumps(self.content))
        return SimpleNamespace(choices=[SimpleNamespace(finish_reason=self.finish_reason, message=message)], model=kwargs["model"])


DRAFT = {"text": "Ravi, the carrier rollback is pending.", "urgent": ["Chase carrier"], "risks": ["Overdue logs"], "gaps": []}


@pytest.fixture()
def no_key(monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", None)


def test_draft_without_key_uses_template(client, login, no_key):
    r = client.post("/api/cases/c1/ai/handoff-draft", json={"toId": "e2", "reason": "workload"}, headers=login("asha.rao"))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["source"] == "template" and "GROQ_API_KEY" in d["note"]
    assert d["text"].startswith("Ravi,") and "CMP-1042" in d["text"]
    # c1's real gaps: t2 unassigned, t3 undated
    assert any("Send remediation plan" in g for g in d["gaps"]) and any("credit note" in g for g in d["gaps"])


def test_ai_permissions(client, login, no_key):
    assert client.post("/api/cases/c1/ai/handoff-draft", json={}, headers=login("ravi.menon")).json()["code"] == "FORBIDDEN"
    assert client.post("/api/handoffs/h1/ai/brief", headers=login("neha.kulkarni")).json()["code"] == "FORBIDDEN"  # sender, not receiver
    r = client.post("/api/handoffs/h1/ai/brief", headers=login("ravi.menon"))
    assert r.status_code == 200 and r.json()["source"] == "template" and "CMP-1038" in r.json()["text"]


def test_draft_with_groq(client, login, monkeypatch):
    fake = FakeGroq(DRAFT)
    monkeypatch.setattr(ai, "_client", lambda: fake)
    r = client.post("/api/cases/c1/ai/handoff-draft", json={"toId": "e2", "reason": "workload", "reasonNote": "Rebalancing"}, headers=login("asha.rao"))
    d = r.json()
    assert d["source"] == "groq" and d["model"] == "openai/gpt-oss-120b" and d["text"] == DRAFT["text"] and "note" not in d

    req = fake.calls[0]
    assert req["model"] == "openai/gpt-oss-120b" and req["reasoning_effort"] == "low"
    fmt = req["response_format"]
    assert fmt["type"] == "json_schema" and fmt["json_schema"]["strict"] is True and fmt["json_schema"]["schema"] == ai.SCHEMA
    system, user = req["messages"]
    assert system["role"] == "system" and "JSON" in system["content"]
    # The case record goes in as data, with the facts the template would use
    prompt = user["content"]
    assert "<case_record>" in prompt and "CMP-1042" in prompt and "UNASSIGNED" in prompt and "Ravi Menon" in prompt
    audit = client.get("/api/sync", headers=login("meera.iyer")).json()["audit"]
    assert any(a["action"] == "ai.handoff_drafted" and "(groq)" in a["detail"] for a in audit)


def test_other_models_use_json_object_mode(client, login, monkeypatch):
    fake = FakeGroq(DRAFT)
    monkeypatch.setattr(ai, "_client", lambda: fake)
    monkeypatch.setattr(settings, "ai_model", "llama-3.3-70b-versatile")
    d = client.post("/api/handoffs/h1/ai/brief", headers=login("ravi.menon")).json()
    assert d["source"] == "groq"
    req = fake.calls[0]
    assert req["response_format"] == {"type": "json_object"} and "reasoning_effort" not in req


@pytest.mark.parametrize("content,finish", [("not json at all", "stop"), ({"text": "missing lists"}, "stop"), (DRAFT, "length")])
def test_bad_replies_fall_back_to_template(client, login, monkeypatch, content, finish):
    monkeypatch.setattr(ai, "_client", lambda: FakeGroq(content, finish))
    d = client.post("/api/handoffs/h1/ai/brief", headers=login("ravi.menon")).json()
    assert d["source"] == "template" and "could not answer" in d["note"]
