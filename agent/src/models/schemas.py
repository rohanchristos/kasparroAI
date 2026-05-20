"""
Kasparro AI Agent — Pydantic Request / Response Schemas.

All API contracts are defined here with strict typing and validation.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, EmailStr


# ── Enums ────────────────────────────────────────────────────

class LlmProvider(str, Enum):
    GROK = "grok"
    OPENAI = "openai"
    OPENROUTER = "openrouter"


class TicketCategory(str, Enum):
    REFUND = "refund"
    TRACKING = "tracking"
    DAMAGED_PRODUCT = "damaged_product"
    WRONG_ITEM = "wrong_item"
    COMPLAINT = "complaint"
    FAQ = "faq"
    POLICY = "policy"
    OTHER = "other"


class TicketSentiment(str, Enum):
    ANGRY = "angry"
    FRUSTRATED = "frustrated"
    NEUTRAL = "neutral"
    POSITIVE = "positive"


class TicketUrgency(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# ── Agent Schemas ────────────────────────────────────────────

class EmailAnalysisRequest(BaseModel):
    """Incoming customer email for AI analysis."""
    email_body: str = Field(..., min_length=1, description="Raw email body text")
    customer_email: str = Field(..., description="Customer email address")
    customer_name: str = Field(default="", description="Customer display name")
    subject: str = Field(..., min_length=1, description="Email subject line")
    llm_provider: LlmProvider = Field(
        default=LlmProvider.GROK,
        description="LLM provider to use for analysis",
    )
    gmail_message_id: Optional[str] = Field(
        default=None,
        description="Gmail message ID to prevent duplicate processing",
    )


class EmailAnalysisResponse(BaseModel):
    """AI analysis result for a customer email."""
    category: TicketCategory
    sentiment: TicketSentiment
    urgency: TicketUrgency
    ai_draft_reply: str = Field(..., description="AI-generated reply draft")
    ai_confidence_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="Model confidence in its analysis (0.0–1.0)",
    )
    ai_suggested_action: str = Field(
        ...,
        description="Recommended next step for the support agent",
    )
    auto_resolve: bool = Field(
        default=False,
        description="Whether the ticket can be auto-resolved without manager approval",
    )
    auto_resolve_reason: Optional[str] = Field(
        default=None,
        description="Explanation of why auto-resolve was recommended (or not)",
    )


class RegenerateRequest(BaseModel):
    """Request to regenerate an AI draft with optional manager feedback."""
    ticket_id: str = Field(..., description="Ticket UUID")
    original_email: str = Field(..., min_length=1, description="Original customer email body")
    llm_provider: LlmProvider = Field(
        default=LlmProvider.GROK,
        description="LLM provider to use for regeneration",
    )
    manager_feedback: Optional[str] = Field(
        default=None,
        description="Manager feedback to guide the regenerated draft",
    )


# ── Email Schemas ────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    """Request to send a reply email via Gmail."""
    to_email: str = Field(..., description="Recipient email address")
    subject: str = Field(..., min_length=1, description="Email subject")
    body: str = Field(..., min_length=1, description="Email body (plain text)")
    ticket_id: Optional[str] = Field(
        default=None,
        description="Related ticket UUID for tracking headers",
    )


class SendEmailResponse(BaseModel):
    """Result of sending an email."""
    success: bool
    message_id: Optional[str] = None
    sent_at: Optional[datetime] = None
    error: Optional[str] = None


class FetchedEmail(BaseModel):
    """A single email fetched from the Gmail inbox."""
    message_id: str
    from_email: str = Field(alias="from")
    subject: str
    body: str
    received_at: str

    model_config = {"populate_by_name": True}


# ── Health Schemas ───────────────────────────────────────────

class LlmProviderStatus(BaseModel):
    """Status of a single LLM provider."""
    name: str
    available: bool
    model: str


class HealthResponse(BaseModel):
    """Service health check response."""
    status: str = "ok"
    service: str = "agent"
    timestamp: datetime
    llm_providers: list[LlmProviderStatus]
    gmail_connected: bool
