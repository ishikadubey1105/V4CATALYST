"""
Start the full Thread stack with one command:

    python run_app.py            (add --reload to auto-restart the backend on code changes)

- backend  : FastAPI on http://localhost:8080   (API docs at /api/docs)
- frontend : Vite on    http://localhost:5173   (wired to the backend, VITE_API_MODE=http)

Installs missing dependencies on first run. Ctrl+C stops both.
"""
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
API_PORT = int(os.environ.get("API_PORT", 8080))
WEB_PORT = int(os.environ.get("WEB_PORT", 5173))

NPM = shutil.which("npm") or shutil.which("npm.cmd")
# Backend auto-reload is opt-in: on Windows uvicorn stops the old worker with a console Ctrl+C, which never
# arrives when there is no console attached, leaving stale code running. Restart the launcher after backend edits.
RELOAD = ["--reload"] if "--reload" in sys.argv[1:] else []


def ensure_deps() -> None:
    try:
        import alembic, fastapi, groq, matplotlib, multipart, psycopg, reportlab, sqlalchemy, uvicorn  # noqa: F401, E401
    except ImportError:
        print("[setup] installing backend requirements...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(BACKEND / "requirements.txt")], check=True)
    if not NPM:
        sys.exit("npm was not found on PATH — install Node.js 18+ first.")
    if not (FRONTEND / "node_modules").is_dir():
        print("[setup] installing frontend packages...")
        subprocess.run([NPM, "ci", "--no-audit", "--no-fund"], cwd=FRONTEND, check=True)


def pipe(name: str, proc: subprocess.Popen) -> None:
    for line in proc.stdout:
        print(f"[{name}] {line}", end="", flush=True)


def main() -> None:
    # Vite prints characters like "➜" that the default Windows console codepage can't encode.
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ensure_deps()

    backend = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(API_PORT), *RELOAD],
        cwd=BACKEND, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
    )
    frontend_env = {**os.environ, "VITE_API_MODE": "http", "VITE_API_BASE_URL": f"http://localhost:{API_PORT}/api"}
    frontend = subprocess.Popen(
        [NPM, "run", "dev", "--", "--port", str(WEB_PORT), "--strictPort"],
        cwd=FRONTEND, env=frontend_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace",
    )
    procs = {"api": backend, "web": frontend}
    for name, p in procs.items():
        threading.Thread(target=pipe, args=(name, p), daemon=True).start()

    print(f"\n  Thread is starting\n  App : http://localhost:{WEB_PORT}\n  API : http://localhost:{API_PORT}/api/docs\n  Ctrl+C to stop\n", flush=True)
    try:
        while all(p.poll() is None for p in procs.values()):
            time.sleep(0.5)
        dead = next(n for n, p in procs.items() if p.poll() is not None)
        print(f"\n[{dead}] exited with code {procs[dead].returncode} — stopping the other one.")
    except KeyboardInterrupt:
        print("\nStopping...")
    finally:
        for p in procs.values():
            if p.poll() is None:
                if os.name == "nt":  # npm spawns child processes; kill the whole tree
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
                else:
                    p.terminate()
        for p in procs.values():
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == "__main__":
    main()
