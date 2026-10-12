from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./baton.db"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    session_ttl_hours: int = 12
    deadline_interval_seconds: int = 60
    upload_dir: str = "./uploads"
    seed_demo: bool = True

    # AI handoff assistant. Without a key the assistant falls back to a template draft built from the same data.
    groq_api_key: str | None = None
    ai_model: str = "openai/gpt-oss-120b"  # any Groq chat model; gpt-oss / qwen get strict JSON-schema output
    ai_effort: str = "low"  # reasoning effort for gpt-oss models: low keeps the demo fast; medium/high for richer drafts
    ai_timeout_seconds: float = 60.0

    # Alert system thresholds
    alert_due_soon_hours: int = 24        # remind the assignee this long before a deadline
    alert_escalate_after_hours: int = 48  # overdue this long -> critical, and every admin is notified
    alert_handoff_wait_hours: int = 24    # a forward waiting this long for the receiver is flagged / reminded
    alert_question_wait_hours: int = 48   # an unanswered question this old is flagged
    alert_stale_case_days: int = 7        # an open case with no activity this long is flagged

    max_failed_logins: int = 5
    max_upload_bytes: int = 25_000_000

    @property
    def cors_origin_list(self) -> list[str]:
        # Browsers send origins without a trailing slash, so "https://site.app/" must still match
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
