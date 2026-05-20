"""
Kasparro AI Agent — FastAPI Application Entry Point.

Production-ready ASGI application with:
- Structured logging (structlog)
- CORS for frontend + NGINX
- Rate limiting (slowapi)
- Background email poller (asyncio)
- Global exception handler
- Health checks with LLM / Gmail status
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from src.config.settings import settings
from src.models.schemas import HealthResponse, LlmProviderStatus
from src.routers.agent_router import router as agent_router
from src.routers.email_router import router as email_router
from src.services.gmail_service import gmail_service
from src.services.email_poller import email_poller
from src.services.llm_service import check_provider_status, get_provider_model

# ── Structured Logging ───────────────────────────────────────

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer()
        if settings.LOG_LEVEL == "DEBUG"
        else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.getLevelName(settings.LOG_LEVEL)
    ),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger("kasparro.agent")

# ── Rate Limiter ─────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

# ── Lifespan (startup / shutdown) ────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage application lifecycle:
    - Startup:  launch the background email poller
    - Shutdown: gracefully stop the poller
    """
    logger.info(
        "agent_starting",
        version="2.0.0",
        cors_origins=settings.cors_origin_list,
        grok_configured=check_provider_status("grok"),
        openai_configured=check_provider_status("openai"),
        gmail_configured=gmail_service.is_connected(),
    )

    # Start background email poller
    if gmail_service.is_connected():
        await email_poller.start()
        logger.info("email_poller_launched")
    else:
        logger.warning(
            "email_poller_skipped",
            reason="Gmail credentials not configured",
        )

    yield  # Application runs here

    # Shutdown
    logger.info("agent_shutting_down")
    await email_poller.stop()
    logger.info("agent_stopped")


# ── Application ──────────────────────────────────────────────

app = FastAPI(
    title="Kasparro AI Agent",
    description=(
        "AI-powered customer support email analysis and response "
        "generation with LangGraph pipeline and Gmail integration"
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ─────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request Logging Middleware ───────────────────────────────


@app.middleware("http")
async def log_requests(request: Request, call_next) -> Response:
    """Log every HTTP request with method, path, status, and duration."""
    start = datetime.now(timezone.utc)

    response: Response = await call_next(request)

    duration_ms = (datetime.now(timezone.utc) - start).total_seconds() * 1000

    logger.info(
        "http_request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round(duration_ms, 2),
        client=request.client.host if request.client else "unknown",
    )

    return response


# ── Global Exception Handler ────────────────────────────────


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return structured JSON."""
    logger.error(
        "unhandled_exception",
        path=request.url.path,
        error=str(exc),
        exc_info=exc,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "INTERNAL_ERROR",
            "message": "An unexpected error occurred",
            "statusCode": 500,
        },
    )


# ── Routers ──────────────────────────────────────────────────

app.include_router(agent_router)
app.include_router(email_router)


# ── Health Check ─────────────────────────────────────────────


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Service health probe with LLM provider status,
    Gmail connectivity, and poller state.
    """
    return HealthResponse(
        status="ok",
        service="agent",
        timestamp=datetime.now(timezone.utc),
        llm_providers=[
            LlmProviderStatus(
                name="grok",
                available=check_provider_status("grok"),
                model=get_provider_model("grok"),
            ),
            LlmProviderStatus(
                name="openai",
                available=check_provider_status("openai"),
                model=get_provider_model("openai"),
            ),
        ],
        gmail_connected=gmail_service.is_connected(),
    )
