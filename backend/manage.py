"""
Database admin commands. Run from the backend folder:

    python manage.py status                      which database, schema revision, row counts
    python manage.py migrate                     apply pending migrations
    python manage.py seed                        load the demo data into an EMPTY database
    python manage.py create-admin USERNAME "Full Name" EMAIL
                                                 first admin for a real deployment (prints a one-time password)
    python manage.py reset --yes                 DELETE EVERYTHING, re-create the schema and reload the demo data

DATABASE_URL (environment or backend/.env) chooses the database, exactly as for the app.
"""
import argparse
import sys

from sqlalchemy import func, select

from app import models as m
from app.db import Base, SessionLocal, engine
from app.migrate import current_revision, upgrade_db
from app.security import hash_password, temp_password
from app.seed import seed


def _masked_url() -> str:
    return engine.url.render_as_string(hide_password=True)


def status(_: argparse.Namespace) -> None:
    print(f"database : {_masked_url()}")
    print(f"revision : {current_revision() or '(no migrations applied)'}")
    with SessionLocal() as db:
        for model in (m.Employee, m.Case, m.Task, m.Handoff, m.Question, m.Document, m.Notification, m.AuditEvent):
            try:
                n = db.scalar(select(func.count()).select_from(model))
            except Exception:
                n = "-"
            print(f"  {model.__tablename__:<14}{n}")


def migrate(_: argparse.Namespace) -> None:
    upgrade_db()
    print(f"schema at revision {current_revision()}")


def seed_cmd(_: argparse.Namespace) -> None:
    upgrade_db()
    with SessionLocal() as db:
        print("demo data loaded" if seed(db) else "database already has employees — nothing loaded")


def create_admin(args: argparse.Namespace) -> None:
    upgrade_db()
    username, email = args.username.strip().lower(), args.email.strip().lower()
    with SessionLocal() as db:
        if db.scalar(select(m.Employee.id).where((m.Employee.username == username) | (func.lower(m.Employee.email) == email))):
            sys.exit(f"an employee with username {username!r} or email {email!r} already exists")
        password = temp_password()
        db.add(m.Employee(id=m.uid("e"), username=username, name=args.name.strip(), email=email, department=args.department,
                          title=args.title, org_role="admin", active=True, tone="bg-emerald-100 text-emerald-900",
                          password_hash=hash_password(password)))
        db.add(m.AuditEvent(id=m.uid("a"), at=m.now(), actor_id="system", action="employee.created",
                            detail=f"{args.name.strip()} ({username}) as admin via manage.py"))
        db.commit()
    print(f"admin {username} created. One-time password (shown once): {password}")


def reset(args: argparse.Namespace) -> None:
    if not args.yes:
        sys.exit(f"this deletes ALL data in {_masked_url()} — re-run with --yes to confirm")
    with engine.begin() as conn:
        Base.metadata.drop_all(conn)
        conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    upgrade_db()
    with SessionLocal() as db:
        seed(db)
    print("database reset and demo data loaded")


def main() -> None:
    p = argparse.ArgumentParser(description="Baton database admin")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=status)
    sub.add_parser("migrate").set_defaults(fn=migrate)
    sub.add_parser("seed").set_defaults(fn=seed_cmd)
    a = sub.add_parser("create-admin")
    a.add_argument("username")
    a.add_argument("name")
    a.add_argument("email")
    a.add_argument("--department", default="Administration")
    a.add_argument("--title", default="Administrator")
    a.set_defaults(fn=create_admin)
    r = sub.add_parser("reset")
    r.add_argument("--yes", action="store_true")
    r.set_defaults(fn=reset)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
