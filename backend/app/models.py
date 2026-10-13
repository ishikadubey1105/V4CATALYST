"""
Database tables. Column names are snake_case; serializers.py maps them to the camelCase shapes in
frontend/src/lib/types.ts. Credentials, sessions and failed-login counts never leave the server
(except failedLogins, which admins receive so the console can show and clear locks).
"""
import secrets
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, LargeBinary, String, Text, TypeDecorator, false
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


def uid(prefix: str) -> str:
    return prefix + secrets.token_hex(5)


class UtcDateTime(TypeDecorator):
    """Stores UTC and always returns timezone-aware datetimes (SQLite drops tzinfo otherwise)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc) if value is not None else None

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    department: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(120))
    org_role: Mapped[str] = mapped_column(String(16), default="employee")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    tone: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(256))
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)


class AuthSession(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime)


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    complainant: Mapped[str] = mapped_column(String(200))
    channel: Mapped[str] = mapped_column(String(32))
    category: Mapped[str] = mapped_column(String(80))
    priority: Mapped[str] = mapped_column(String(16))
    stage: Mapped[str] = mapped_column(String(32), default="received")
    prev_stage: Mapped[str | None] = mapped_column(String(32), nullable=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    summary: Mapped[str] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    by: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    rationale: Mapped[str] = mapped_column(Text)
    by: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(16))
    size: Mapped[int] = mapped_column(Integer)
    by: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)
    storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)  # files uploaded before 0005 (on disk); None otherwise
    # The file itself. Kept in the database so uploads survive on hosts without a persistent disk (Vercel, Render free).
    content: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    owner_id: Mapped[str | None] = mapped_column(ForeignKey("employees.id"), nullable=True, index=True)  # visibility lookups
    due: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    overdue_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    # Alert system: each reminder fires once per deadline (reset when the deadline changes)
    due_soon_notified: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    escalated: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    handoff_id: Mapped[str | None] = mapped_column(ForeignKey("handoffs.id"), nullable=True)
    by: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    text: Mapped[str] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    answered_by: Mapped[str | None] = mapped_column(ForeignKey("employees.id"), nullable=True)


class Handoff(Base):
    __tablename__ = "handoffs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    from_id: Mapped[str] = mapped_column(ForeignKey("employees.id"))
    to_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    reason: Mapped[str] = mapped_column(String(32))
    reason_note: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="submitted")
    created_at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)
    decided_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    acks: Mapped[dict] = mapped_column(JSON)
    reminded: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())  # waiting-handoff reminder sent


class Ownership(Base):
    __tablename__ = "ownership"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    from_at: Mapped[datetime] = mapped_column(UtcDateTime)
    to_at: Mapped[datetime | None] = mapped_column(UtcDateTime, nullable=True)
    via: Mapped[str] = mapped_column(String(16))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("employees.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(Text)  # built from task/case titles, so it can exceed their own limits
    body: Mapped[str] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(UtcDateTime, default=now)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    link: Mapped[str] = mapped_column(String(300))


class AuditEvent(Base):
    """Append-only. Nothing in the API updates or deletes these rows."""

    __tablename__ = "audit"
    # Reports read events by action within a date range (resolutions, downloads, missed deadlines)
    __table_args__ = (Index("ix_audit_action_at", "action", "at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    at: Mapped[datetime] = mapped_column(UtcDateTime, default=now, index=True)
    actor_id: Mapped[str] = mapped_column(String(32))  # an employee id, or "system"
    action: Mapped[str] = mapped_column(String(64))
    case_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    detail: Mapped[str] = mapped_column(Text)
