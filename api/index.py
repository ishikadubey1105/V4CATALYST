"""
Vercel entry point: serves the FastAPI backend (backend/app) as one Python function. vercel.json routes every /api/*
request here; the React build in frontend/dist is served as static files from the same domain, so no CORS is needed.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ.setdefault("MPLCONFIGDIR", "/tmp/matplotlib")  # matplotlib needs a writable cache dir; only /tmp is

from app.main import app  # noqa: E402,F401  (Vercel serves the ASGI `app`)
