from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import func, inspect, select

from app import models as m
from app.db import Base, SessionLocal, engine
from app.migrate import alembic_config, current_revision, upgrade_db
from app.seed import seed
from conftest import wipe_database


def head() -> str:
    from alembic.script import ScriptDirectory

    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def test_migrations_match_models():
    """If this fails, a model changed without a migration: run `python -m alembic revision --autogenerate -m ...`."""
    wipe_database()
    upgrade_db()
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn, opts={"compare_type": True}), Base.metadata)
    assert diff == []
    assert current_revision() == head()


def test_legacy_database_is_adopted_without_data_loss():
    """A database made by create_all before migrations existed (like an early baton.db) is stamped, then upgraded."""
    wipe_database()
    legacy = [t for t in Base.metadata.sorted_tables]
    with engine.begin() as conn:
        Base.metadata.create_all(conn, tables=legacy)
        conn.exec_driver_sql("DROP INDEX IF EXISTS ix_tasks_owner_id")  # added in 0002, absent from old databases
    with SessionLocal() as db:
        seed(db)

    upgrade_db()

    assert current_revision() == head()
    assert "ix_tasks_owner_id" in {i["name"] for i in inspect(engine).get_indexes("tasks")}
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(m.Case)) == 6


def test_downgrade_and_upgrade_round_trip():
    wipe_database()
    upgrade_db()
    cfg = alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, "base")
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    upgrade_db()
    assert current_revision() == head()
