"""
Kasparro AI Agent — Agent Orchestrator Service.

Bridges the FastAPI request/response layer with the compiled
LangGraph. Converts Pydantic models ↔ AgentState and handles
all error scenarios.
"""

from __future__ import annotations

import structlog

from src.agent.graph import compiled_graph
from src.models.schemas import (
    EmailAnalysisRequest,
    EmailAnalysisResponse,
    RegenerateRequest,
    TicketCategory,
    TicketSentiment,
    TicketUrgency,
)

logger = structlog.get_logger(__name__)


async def run_agent(request: EmailAnalysisRequest) -> EmailAnalysisResponse:
    """
    Execute the full LangGraph pipeline for a customer email.

    1. Build initial AgentState from the request.
    2. Invoke the compiled graph (async).
    3. Map the final state to an EmailAnalysisResponse.
    4. On failure, return a safe fallback response.

    Args:
        request: Validated EmailAnalysisRequest from the router.

    Returns:
        EmailAnalysisResponse with classification, draft, and routing.
    """
    logger.info(
        "agent_run_start",
        customer_email=request.customer_email,
        subject=request.subject,
        provider=request.llm_provider,
    )

    try:
        # ── Build initial state ──────────────────────────────
        initial_state = {
            "email_body": request.email_body,
            "customer_email": request.customer_email,
            "customer_name": request.customer_name or "Customer",
            "subject": request.subject,
            "llm_provider": request.llm_provider.value,
            "gmail_message_id": request.gmail_message_id or "",
            # Everything else starts as None / empty
            "category": None,
            "sentiment": None,
            "urgency": None,
            "intent_details": None,
            "draft_reply": None,
            "confidence_score": None,
            "suggested_action": None,
            "auto_resolve": None,
            "auto_resolve_reason": None,
            "requires_human": None,
            "error": None,
            "processing_steps": [],
        }

        # ── Run the graph ────────────────────────────────────
        final_state = await compiled_graph.ainvoke(initial_state)

        # ── Map state → response ─────────────────────────────
        response = _state_to_response(final_state)

        logger.info(
            "agent_run_complete",
            category=response.category,
            sentiment=response.sentiment,
            urgency=response.urgency,
            confidence=response.ai_confidence_score,
            auto_resolve=response.auto_resolve,
            steps=final_state.get("processing_steps", []),
        )

        return response

    except Exception as exc:
        logger.error("agent_run_fatal", error=str(exc), exc_info=True)
        return _fallback_response(request, str(exc))


async def run_regeneration(request: RegenerateRequest) -> EmailAnalysisResponse:
    """
    Re-run the graph for draft regeneration with optional manager feedback.

    Uses the same pipeline but injects the feedback into the email body
    context so the LLM can incorporate it.
    """
    logger.info(
        "agent_regenerate_start",
        ticket_id=request.ticket_id,
        provider=request.llm_provider,
        has_feedback=bool(request.manager_feedback),
    )

    try:
        # Prepend manager feedback to the email body as context
        email_body = request.original_email
        if request.manager_feedback:
            email_body = (
                f"[MANAGER FEEDBACK FOR REGENERATION]: {request.manager_feedback}\n\n"
                f"---\n\n"
                f"ORIGINAL CUSTOMER EMAIL:\n{request.original_email}"
            )

        initial_state = {
            "email_body": email_body,
            "customer_email": "",
            "customer_name": "Customer",
            "subject": f"Regeneration for ticket {request.ticket_id}",
            "llm_provider": request.llm_provider.value,
            "gmail_message_id": "",
            "category": None,
            "sentiment": None,
            "urgency": None,
            "intent_details": None,
            "draft_reply": None,
            "confidence_score": None,
            "suggested_action": None,
            "auto_resolve": None,
            "auto_resolve_reason": None,
            "requires_human": None,
            "error": None,
            "processing_steps": ["regeneration_requested"],
        }

        final_state = await compiled_graph.ainvoke(initial_state)
        response = _state_to_response(final_state)

        logger.info(
            "agent_regenerate_complete",
            ticket_id=request.ticket_id,
            confidence=response.ai_confidence_score,
        )

        return response

    except Exception as exc:
        logger.error("agent_regenerate_fatal", error=str(exc))
        raise


# ── Helpers ──────────────────────────────────────────────────

def _state_to_response(state: dict) -> EmailAnalysisResponse:
    """Map final AgentState dict to a Pydantic response model."""

    # Safe enum parsing with fallbacks
    try:
        category = TicketCategory(state.get("category", "other"))
    except ValueError:
        category = TicketCategory.OTHER

    try:
        sentiment = TicketSentiment(state.get("sentiment", "neutral"))
    except ValueError:
        sentiment = TicketSentiment.NEUTRAL

    try:
        urgency = TicketUrgency(state.get("urgency", "medium"))
    except ValueError:
        urgency = TicketUrgency.MEDIUM

    return EmailAnalysisResponse(
        category=category,
        sentiment=sentiment,
        urgency=urgency,
        ai_draft_reply=state.get("draft_reply", ""),
        ai_confidence_score=float(state.get("confidence_score", 0.0)),
        ai_suggested_action=state.get("suggested_action", ""),
        auto_resolve=bool(state.get("auto_resolve", False)),
        auto_resolve_reason=state.get("auto_resolve_reason"),
    )


def _fallback_response(
    request: EmailAnalysisRequest, error_msg: str
) -> EmailAnalysisResponse:
    """Build a safe fallback response when the entire pipeline fails."""
    return EmailAnalysisResponse(
        category=TicketCategory.OTHER,
        sentiment=TicketSentiment.NEUTRAL,
        urgency=TicketUrgency.MEDIUM,
        ai_draft_reply=(
            f"Dear {request.customer_name or 'Customer'},\n\n"
            f"Thank you for reaching out to Kasparro support. We have received "
            f"your message regarding \"{request.subject}\" and our team is "
            f"reviewing it.\n\n"
            f"A support agent will respond to you within 24 hours.\n\n"
            f"We apologize for any inconvenience.\n\n"
            f"Best regards,\n"
            f"Kasparro Customer Support Team"
        ),
        ai_confidence_score=0.0,
        ai_suggested_action=(
            f"CRITICAL: AI pipeline failed ({error_msg}). "
            f"Manual response required immediately."
        ),
        auto_resolve=False,
        auto_resolve_reason=f"Pipeline failure: {error_msg}",
    )
