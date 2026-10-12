"""
Thread API — implements frontend/src/api/contracts.ts. Every route lives under /api.

    uvicorn app.main:app --reload --port 8080
"""
import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .db import SessionLocal
from .deadlines import deadline_loop
from .errors import ApiError
from .migrate import upgrade_db
from .routers import ai, auth, cases, employees, handoffs, insights, notifications, sync
from .seed import seed
from .seed_history import seed_history

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    upgrade_db()  # Alembic migrations; also adopts databases created before migrations existed
    if settings.seed_demo:
        with SessionLocal() as db:
            if seed(db):
                logging.getLogger("baton").info("Seeded demo data")
    if settings.seed_history:
        with SessionLocal() as db:
            if n := seed_history(db):  # refuses to run twice, so restarts are safe
                logging.getLogger("baton").info("Seeded %d historical complaints", n)
    watcher = asyncio.create_task(deadline_loop(settings.deadline_interval_seconds)) if settings.deadline_interval_seconds > 0 else None
    yield
    if watcher:
        watcher.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await watcher


app = FastAPI(title="Thread API", version="1.0.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],  # lets the browser read the PDF's file name cross-origin
)


# ---------- Every error leaves as { code, message } ----------

@app.exception_handler(ApiError)
async def api_error(_: Request, exc: ApiError):
    return JSONResponse({"code": exc.code, "message": exc.message}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query", "path"))
    message = f"{field}: {first.get('msg', 'Invalid value')}" if field else first.get("msg", "Invalid request")
    return JSONResponse({"code": "VALIDATION_ERROR", "message": message}, status_code=422)


@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException):
    codes = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}
    return JSONResponse({"code": codes.get(exc.status_code, f"HTTP_{exc.status_code}"), "message": str(exc.detail)}, status_code=exc.status_code)


@app.exception_handler(Exception)
async def unexpected_error(_: Request, exc: Exception):
    logging.getLogger("baton").exception("Unhandled error", exc_info=exc)
    return JSONResponse({"code": "INTERNAL", "message": "Something went wrong on the server."}, status_code=500)


for r in (auth.router, sync.router, cases.router, handoffs.router, notifications.router, employees.router, ai.router, insights.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health", tags=["meta"])
def health():
    return {"ok": True}
