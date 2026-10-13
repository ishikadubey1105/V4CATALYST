import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Vercel sets VERCEL=1 in its functions. Serverless means: no persistent disk, no always-on background loop,
# many short-lived instances (so no connection pool per instance), and a 4.5 MB request body limit.
SERVERLESS = bool(os.environ.get("VERCEL"))
DEFAULT_DATABASE_URL = "sqlite:///./baton.db"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = DEFAULT_DATABASE_URL
    # Vercel's Postgres integrations (Neon, Supabase) set POSTGRES_URL; used when DATABASE_URL is not set
    postgres_url: str | None = None
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    session_ttl_hours: int = 12
    deadline_interval_seconds: int = 60
    upload_dir: str = "./uploads"  # only read for documents uploaded before files were stored in the database
    seed_demo: bool = True
    seed_history: bool = False  # also add ~21 months of past complaints (for the reports) on startup; runs once
    # Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" to /api/cron/deadlines
    cron_secret: str | None = None

    # Alert system thresholds
    alert_due_soon_hours: int = 24        # remind the assignee this long before a deadline
    alert_escalate_after_hours: int = 48  # overdue this long -> critical, and every admin is notified
    alert_handoff_wait_hours: int = 24    # a forward waiting this long for the receiver is flagged / reminded
    alert_question_wait_hours: int = 48   # an unanswered question this old is flagged
    alert_stale_case_days: int = 7        # an open case with no activity this long is flagged

    # Organisation timezone: report periods, report timestamps and reminder texts use it (servers run on UTC)
    app_timezone: str = "Asia/Kolkata"

    max_failed_logins: int = 5
    # Vercel rejects request bodies over 4.5 MB before they reach the app, so stay under that there
    max_upload_bytes: int = 4_000_000 if SERVERLESS else 25_000_000

    @model_validator(mode="after")
    def _postgres_fallback(self):
        if self.postgres_url and self.database_url == DEFAULT_DATABASE_URL:
            self.database_url = self.postgres_url
        return self

    @property
    def serverless(self) -> bool:
        return SERVERLESS

    @property
    def cors_origin_list(self) -> list[str]:
        # Browsers send origins without a trailing slash, so "https://site.app/" must still match
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()


def local_tz():
    """The organisation's timezone (IANA name in APP_TIMEZONE)."""
    from zoneinfo import ZoneInfo

    return ZoneInfo(settings.app_timezone)
