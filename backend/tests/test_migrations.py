from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import func, inspect, select

from app import models as m
from app.db import Base, SessionLocal, engine
from app.migrate import alembic_config, current_revision, migration_connection, upgrade_db
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
    # Build a genuine baseline-schema database *with data*: seed at head, downgrade to the baseline, forget history.
    wipe_database()
    upgrade_db()
    with SessionLocal() as db:
        seed(db)
    cfg = alembic_config()
    with migration_connection(engine) as conn:
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, "0001")
        conn.exec_driver_sql("DROP TABLE alembic_version")
    assert "escalated" not in {c["name"] for c in inspect(engine).get_columns("tasks")}

    upgrade_db()

    assert current_revision() == head()
    assert "ix_tasks_owner_id" in {i["name"] for i in inspect(engine).get_indexes("tasks")}
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(m.Case)) == 6
        assert db.scalar(select(func.count()).select_from(m.Question)) == 2  # rows pointing at rebuilt tables survive
        assert db.get(m.Task, "t10").escalated is False  # new column filled from its default


def test_downgrade_and_upgrade_round_trip():
    wipe_database()
    upgrade_db()
    with SessionLocal() as db:  # with data, so SQLite table rebuilds must cope with foreign keys
        seed(db)
    upgrade_db()
    cfg = alembic_config()
    with migration_connection(engine) as conn:
        cfg.attributes["connection"] = conn
        command.downgrade(cfg, "0001")
        command.downgrade(cfg, "base")
    assert set(inspect(engine).get_table_names()) <= {"alembic_version"}
    upgrade_db()
    assert current_revision() == head()
