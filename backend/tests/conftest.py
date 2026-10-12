import os
import tempfile

# Configure before the app is imported: throwaway database and upload dir, no background watcher.
_tmp = tempfile.mkdtemp(prefix="baton-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["DEADLINE_INTERVAL_SECONDS"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402

PASSWORDS = {
    "asha.rao": "Asha@2026", "ravi.menon": "Ravi@2026", "neha.kulkarni": "Neha@2026", "karan.joshi": "Karan@2026",
    "meera.iyer": "Meera@Admin26", "arjun.shah": "Arjun@Admin26",
}


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def login(client):
    """login("asha.rao") -> headers dict for that user."""
    def _login(username: str, password: str | None = None) -> dict:
        r = client.post("/api/auth/login", json={"username": username, "password": password or PASSWORDS[username]})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['token']}"}
    return _login
