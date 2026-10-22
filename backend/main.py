"""PySQA Web — FastAPI entry point."""
from __future__ import annotations

import traceback
from pathlib import Path

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from routers import audio, processing, export, frf
from services.audio_service import SectionError
from services.session_store import InvalidIdError, audio_ram_mb, load_all_sessions, start_janitor
from utils import limits
from utils.lang import msg, set_lang

# ── App ───────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    load_all_sessions()
    start_janitor()
    yield

app = FastAPI(title="PySQA Web API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # open for ngrok / any origin
    allow_credentials=False,      # must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Language of the messages (the browser sends X-Lang: pt | en) ──────────────
class LanguageMiddleware:
    """Plain ASGI middleware (not @app.middleware("http"): that kind wraps the request and breaks
    request.is_disconnected(), which the queue of heavy calculations relies on to drop abandoned requests)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            h = dict(scope.get("headers") or [])
            set_lang((h.get(b"x-lang") or h.get(b"accept-language") or b"").decode("latin-1"))
        await self.app(scope, receive, send)


app.add_middleware(LanguageMiddleware)


# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print("\n=== UNHANDLED EXCEPTION ===")
    print(tb)
    print("===========================\n")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": tb},
    )


@app.exception_handler(InvalidIdError)
async def invalid_id_handler(request: Request, exc: InvalidIdError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(SectionError)
async def section_handler(request: Request, exc: SectionError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(limits.ResourceLimitError)
async def resource_limit_handler(request: Request, exc: limits.ResourceLimitError):
    return JSONResponse(status_code=413, content={"detail": str(exc)})


@app.exception_handler(limits.RequestCancelled)
async def request_cancelled_handler(request: Request, exc: limits.RequestCancelled):
    return JSONResponse(status_code=499, content={"detail": msg("A requisição foi cancelada.", "The request was cancelled.")})     # nobody is listening


@app.exception_handler(limits.ServerBusyError)
async def server_busy_handler(request: Request, exc: limits.ServerBusyError):
    return JSONResponse(status_code=503, content={"detail": str(exc)})

# ── API routers ───────────────────────────────────────────────────────────────
app.include_router(audio.router,      prefix="/api/audio",      tags=["audio"])
app.include_router(processing.router, prefix="/api/processing", tags=["processing"])
app.include_router(export.router,     prefix="/api/export",     tags=["export"])
app.include_router(frf.router,        prefix="/api/frf",        tags=["frf"])


@app.get("/api/health")
def health():
    import importlib
    deps = ["scipy", "numpy", "mosqito", "soundfile", "openpyxl"]
    status = {}
    for dep in deps:
        try:
            m = importlib.import_module(dep)
            status[dep] = getattr(m, "__version__", "ok")
        except ImportError as e:
            status[dep] = f"MISSING: {e}"
    return {"status": "ok", "dependencies": status, "limits": limits.describe(audio_ram_mb())}


# ── Serve built frontend (must come AFTER API routes) ─────────────────────────
DIST = Path(__file__).parent.parent / "frontend" / "dist"

if DIST.exists():
    # Serve static assets (JS, CSS, images)
    assets_dir = DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # SPA fallback — serve static file if it exists, otherwise return index.html
    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        candidate = DIST / full_path
        if candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(DIST / "index.html"))
else:
    @app.get("/")
    def root():
        return {"message": "Frontend not built. Run: cd frontend && npm run build"}
