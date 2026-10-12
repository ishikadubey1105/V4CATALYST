"""Bring the database schema up to date with Alembic (runs on every startup; a no-op when already current)."""
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from .db import engine as default_engine

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"
BASELINE = "0001"  # the schema databases had before migrations existed (they were made with create_all)

logger = logging.getLogger("baton.migrate")


def alembic_config() -> Config:
    return Config(str(ALEMBIC_INI))


def upgrade_db(engine: Engine = default_engine) -> None:
    tables = set(inspect(engine).get_table_names())
    cfg = alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        if "employees" in tables and "alembic_version" not in tables:
            # Pre-migration database: its tables already match the baseline, so record that instead of re-creating them.
            logger.info("Existing database without migration history: marking it as revision %s", BASELINE)
            command.stamp(cfg, BASELINE)
        command.upgrade(cfg, "head")


def current_revision(engine: Engine = default_engine) -> str | None:
    from alembic.runtime.migration import MigrationContext

    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()
