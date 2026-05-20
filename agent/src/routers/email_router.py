"""
Kasparro AI Agent — Email Router (Production).

POST /api/email/send    — Send reply email via Gmail API
GET  /api/email/fetch   — Manually fetch unread emails (testing)
POST /api/email/test    — Test agent with mock email (no Gmail needed)
GET  /api/email/health  — Email service health
"""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.config.settings import settings

from src.models.schemas import (
    EmailAnalysisRequest,
    EmailAnalysisResponse,
    LlmProvider,
    SendEmailRequest,
    SendEmailResponse,
)
from src.services.agent_service import run_agent
from src.services.gmail_service import gmail_service
from src.services.email_poller import email_poller

logger = structlog.get_logger(__name__)

BACKEND_URL = settings.BACKEND_URL

router = APIRouter(prefix="/api/email", tags=["Email"])

limiter = Limiter(key_func=get_remote_address)


# ── Request Models ───────────────────────────────────────────

class TestEmailRequest(BaseModel):
    """Mock email for testing the agent without real Gmail."""
    email_body: str = Field(
        ..., min_length=1,
        description="Simulated customer email body",
    )
    customer_email: str = Field(
        default="test@example.com",
        description="Simulated customer email address",
    )
    customer_name: str = Field(
        default="Test Customer",
        description="Simulated customer name",
    )
    subject: str = Field(
        default="Test Support Request",
        description="Simulated email subject",
    )
    llm_provider: LlmProvider = Field(
        default=LlmProvider.GROK,
        description="LLM provider to use",
    )


# ── POST /send ───────────────────────────────────────────────

@router.post("/send", response_model=SendEmailResponse)
@limiter.limit("10/minute")
async def send_email(
    request: Request,
    payload: SendEmailRequest,
):
    """
    Send a reply email to a customer via the Gmail API.
    Also logs the action to the backend audit trail.
    """
    logger.info(
        "endpoint_send_email",
        to=payload.to_email,
        subject=payload.subject,
        ticket_id=payload.ticket_id,
    )

    if not gmail_service.is_connected():
        raise HTTPException(
            status_code=503,
            detail="Gmail service is not configured. Set OAuth credentials in .env",
        )

    # Send via Gmail
    result = await gmail_service.send_email(
        to=payload.to_email,
        subject=payload.subject,
        body=payload.body,
        ticket_id=payload.ticket_id,
    )

    if not result.success:
        logger.error("endpoint_send_failed", error=result.error)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to send email: {result.error}",
        )

    # Log to audit trail via Node.js backend
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{BACKEND_URL}/api/tickets/{payload.ticket_id}/audit" if payload.ticket_id else f"{BACKEND_URL}/api/audit",
                json={
                    "action": "email_sent",
                    "details": {
                        "to": payload.to_email,
                        "subject": payload.subject,
                        "gmail_message_id": result.gmail_message_id,
                        "ticket_id": payload.ticket_id,
                    },
                },
            )
    except Exception as exc:
        # Audit logging failure is non-fatal
        logger.warning("endpoint_audit_log_failed", error=str(exc))

    return SendEmailResponse(
        success=True,
        message_id=result.gmail_message_id,
        sent_at=result.sent_at,
    )


# ── GET /fetch ───────────────────────────────────────────────

@router.get("/fetch")
@limiter.limit("10/minute")
async def fetch_unread_emails(
    request: Request,
    max_results: int = Query(default=20, ge=1, le=50),
):
    """
    Manually fetch unread emails from the Gmail inbox.
    Returns raw email data WITHOUT processing (for testing/inspection).
    """
    logger.info("endpoint_fetch_emails", max_results=max_results)

    if not gmail_service.is_connected():
        raise HTTPException(
            status_code=503,
            detail="Gmail service is not configured. Set OAuth credentials in .env",
        )

    emails = await gmail_service.fetch_unread_emails(max_results=max_results)

    return {
        "emails": [e.model_dump() for e in emails],
        "count": len(emails),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# ── POST /test ───────────────────────────────────────────────

@router.post("/test", response_model=EmailAnalysisResponse)
@limiter.limit("20/minute")
async def test_email_analysis(
    request: Request,
    payload: TestEmailRequest,
):
    """
    Test the AI agent with a mock email — no Gmail needed.

    Send any email body and get back the full LangGraph analysis:
    classification, sentiment, urgency, draft reply, and routing.
    Useful for demos, integration testing, and development.
    """
    logger.info(
        "endpoint_test_email",
        subject=payload.subject,
        provider=payload.llm_provider,
        body_length=len(payload.email_body),
    )

    analysis_request = EmailAnalysisRequest(
        email_body=payload.email_body,
        customer_email=payload.customer_email,
        customer_name=payload.customer_name,
        subject=payload.subject,
        llm_provider=payload.llm_provider,
        gmail_message_id=None,
    )

    result = await run_agent(analysis_request)

    logger.info(
        "endpoint_test_complete",
        category=result.category,
        sentiment=result.sentiment,
        urgency=result.urgency,
        confidence=result.ai_confidence_score,
        auto_resolve=result.auto_resolve,
    )

    return result


# ── POST /poll (manual trigger) ──────────────────────────────

@router.post("/poll")
@limiter.limit("5/minute")
async def trigger_poll(request: Request):
    """
    Manually trigger a single polling cycle.
    Useful for testing the full pipeline without waiting 60 seconds.
    """
    logger.info("endpoint_manual_poll_triggered")

    if not gmail_service.is_connected():
        raise HTTPException(
            status_code=503,
            detail="Gmail service is not configured.",
        )

    processed = await email_poller.poll_once()

    return {
        "message": f"Poll cycle complete. Processed {processed} email(s).",
        "processed": processed,
        "polled_at": datetime.now(timezone.utc).isoformat(),
    }


# ── GET /health ──────────────────────────────────────────────

@router.get("/health")
async def email_health():
    """Email sub-service health check."""
    return {
        "status": "ok",
        "service": "email",
        "gmail_connected": gmail_service.is_connected(),
        "poller_running": email_poller._running,
    }
