import os
import tempfile

# Configure before the app is imported: throwaway database and upload dir, no background watcher.
# Set TEST_DATABASE_URL (e.g. postgresql://user:pass@localhost/baton_test) to run the suite on Postgres.
# WARNING: the tests wipe that database.
_tmp = tempfile.mkdtemp(prefix="baton-test-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}/test.db"
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["DEADLINE_INTERVAL_SECONDS"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.migrate import upgrade_db  # noqa: E402
from app.seed import seed  # noqa: E402

PASSWORDS = {
    "asha.rao": "Asha@2026", "ravi.menon": "Ravi@2026", "neha.kulkarni": "Neha@2026", "karan.joshi": "Karan@2026",
    "meera.iyer": "Meera@Admin26", "arjun.shah": "Arjun@Admin26",
}


def wipe_database() -> None:
    with engine.begin() as conn:
        Base.metadata.drop_all(conn)
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")


@pytest.fixture()
def client():
    # Schema comes from the migrations (not create_all), so every test also exercises them.
    wipe_database()
    upgrade_db()
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
