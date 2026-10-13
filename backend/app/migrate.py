"""Bring the database schema up to date with Alembic (runs on every startup; a no-op when already current)."""
import logging
from contextlib import contextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine import Connection, Engine

from .db import engine as default_engine

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"
BASELINE = "0001"  # the schema databases had before migrations existed (they were made with create_all)

logger = logging.getLogger("baton.migrate")


def alembic_config() -> Config:
    return Config(str(ALEMBIC_INI))


@contextmanager
def migration_connection(engine: Engine):
    """
    A connection for running migrations. On SQLite, adding a column rebuilds the table (copy, drop, rename);
    with foreign keys enforced, dropping a table that other rows reference fails. So foreign keys are switched
    off for the migration (the PRAGMA only works outside a transaction) and checked afterwards instead.
    """
    with engine.connect() as conn:
        sqlite = conn.dialect.name == "sqlite"
        if sqlite:
            conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        try:
            yield conn
            conn.commit()
        finally:
            if sqlite:
                conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        if sqlite:
            broken = conn.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
            if broken:
                raise RuntimeError(f"Migration left broken foreign keys: {broken[:5]}")


def _upgrade(conn: Connection, tables: set[str]) -> None:
    cfg = alembic_config()
    cfg.attributes["connection"] = conn
    if "employees" in tables and "alembic_version" not in tables:
        # Pre-migration database: its tables already match the baseline, so record that instead of re-creating them.
        logger.info("Existing database without migration history: marking it as revision %s", BASELINE)
        command.stamp(cfg, BASELINE)
    command.upgrade(cfg, "head")


MIGRATION_LOCK = 7_314_002  # any constant: Postgres advisory lock id shared by every instance of this app


def upgrade_db(engine: Engine = default_engine) -> None:
    with migration_connection(engine) as conn:
        if conn.dialect.name == "postgresql":
            # Several instances can cold-start at once (serverless, or more than one worker): only one migrates,
            # the others wait here and then find the schema current. Released when the migration commits.
            conn.exec_driver_sql(f"SELECT pg_advisory_xact_lock({MIGRATION_LOCK})")
        _upgrade(conn, set(inspect(conn).get_table_names()))


def current_revision(engine: Engine = default_engine) -> str | None:
    from alembic.runtime.migration import MigrationContext

    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()
