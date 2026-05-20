"""
Kasparro AI Agent — Agent Router.

POST /api/agent/analyze      — Analyze a customer email via LangGraph
POST /api/agent/regenerate   — Regenerate draft with manager feedback
GET  /api/agent/providers    — List available LLM providers + status
GET  /api/agent/health       — Agent service health
"""

import structlog
from fastapi import APIRouter, Header, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.models.schemas import (
    EmailAnalysisRequest,
    EmailAnalysisResponse,
    LlmProvider,
    RegenerateRequest,
)
from src.services.agent_service import run_agent, run_regeneration
from src.services.llm_service import get_llm_info

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/agent", tags=["AI Agent"])

limiter = Limiter(key_func=get_remote_address)


def _resolve_provider(header_value: str | None, body_value: str | None) -> str:
    """Resolve LLM provider: header > body > default 'grok'."""
    if header_value and header_value.lower() in ("grok", "openai", "openrouter"):
        return header_value.lower()
    if body_value and body_value.lower() in ("grok", "openai", "openrouter"):
        return body_value.lower()
    return "grok"


# ── POST /analyze ────────────────────────────────────────────

@router.post("/analyze", response_model=EmailAnalysisResponse)
@limiter.limit("30/minute")
async def analyze_email(
    request: Request,
    payload: EmailAnalysisRequest,
    x_llm_provider: str | None = Header(default=None, alias="X-LLM-Provider"),
):
    """
    Run the full LangGraph pipeline on a customer email.
    X-LLM-Provider header overrides the body's llm_provider field.
    """
    resolved = _resolve_provider(x_llm_provider, payload.llm_provider.value)
    payload.llm_provider = LlmProvider(resolved)

    logger.info(
        "endpoint_analyze_email",
        customer_email=payload.customer_email,
        subject=payload.subject,
        provider=resolved,
    )

    result = await run_agent(payload)

    logger.info(
        "endpoint_analyze_complete",
        category=result.category,
        sentiment=result.sentiment,
        urgency=result.urgency,
        confidence=result.ai_confidence_score,
        auto_resolve=result.auto_resolve,
    )

    return result


# ── POST /regenerate ─────────────────────────────────────────

@router.post("/regenerate", response_model=EmailAnalysisResponse)
@limiter.limit("20/minute")
async def regenerate_draft(
    request: Request,
    payload: RegenerateRequest,
    x_llm_provider: str | None = Header(default=None, alias="X-LLM-Provider"),
):
    """
    Re-run the LangGraph pipeline to regenerate a draft.
    X-LLM-Provider header overrides the body's llm_provider field.
    """
    resolved = _resolve_provider(x_llm_provider, payload.llm_provider.value)
    payload.llm_provider = LlmProvider(resolved)

    logger.info(
        "endpoint_regenerate",
        ticket_id=payload.ticket_id,
        provider=resolved,
        has_feedback=bool(payload.manager_feedback),
    )

    result = await run_regeneration(payload)

    return result


# ── GET /providers ───────────────────────────────────────────

@router.get("/providers")
async def list_providers(
    x_llm_provider: str | None = Header(default=None, alias="X-LLM-Provider"),
):
    """
    List all available LLM providers with status and metadata.
    Returns the user's current selection from the X-LLM-Provider header.
    """
    providers = [
        get_llm_info("grok"),
        get_llm_info("openai"),
        get_llm_info("openrouter"),
    ]

    current = x_llm_provider if x_llm_provider in ("grok", "openai", "openrouter") else "grok"

    return {
        "providers": providers,
        "current": current,
    }


# ── GET /health ──────────────────────────────────────────────

@router.get("/health")
async def agent_health():
    """Agent sub-service health check."""
    return {
        "status": "ok",
        "service": "ai_agent",
        "graph": "compiled",
        "nodes": [
            "classify_email",
            "route_decision",
            "draft_auto_reply",
            "draft_human_review",
            "quality_check",
            "finalize",
        ],
    }
