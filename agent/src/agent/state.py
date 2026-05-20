"""
Kasparro AI Agent — LangGraph Agent State.

Typed state definition that flows through every node in the
email-processing graph. Each node reads what it needs and
writes back its results.
"""

from __future__ import annotations

from typing import Optional

from typing_extensions import TypedDict


class AgentState(TypedDict):
    """
    Immutable contract for data flowing through the LangGraph pipeline.

    ── Inputs (set once at invocation) ────────────────────────
    email_body          Raw customer email content.
    customer_email      Customer's email address.
    customer_name       Customer's display name.
    subject             Email subject line.
    llm_provider        LLM to use ("grok" | "openai").
    gmail_message_id    Gmail API message ID (dedup key).

    ── Classification (set by classify_email_node) ────────────
    category            Ticket category enum value.
    sentiment           Customer sentiment enum value.
    urgency             Urgency level enum value.
    intent_details      Extracted details: order numbers, amounts, etc.

    ── Routing (set by route_decision_node) ───────────────────
    auto_resolve        True if the ticket can skip manager review.
    auto_resolve_reason Why the ticket was/wasn't auto-resolved.
    requires_human      True if a manager must review before sending.

    ── Draft (set by draft nodes) ─────────────────────────────
    draft_reply         AI-generated email reply text.
    confidence_score    Model confidence in the draft (0.0–1.0).
    suggested_action    Recommended next step for support agent.

    ── Meta ───────────────────────────────────────────────────
    processing_steps    Ordered log of which nodes executed.
    error               Error message if any node failed.
    """

    # Inputs
    email_body: str
    customer_email: str
    customer_name: str
    subject: str
    llm_provider: str
    gmail_message_id: str

    # Classification
    category: Optional[str]
    sentiment: Optional[str]
    urgency: Optional[str]
    intent_details: Optional[dict]

    # Routing
    auto_resolve: Optional[bool]
    auto_resolve_reason: Optional[str]
    requires_human: Optional[bool]

    # Draft
    draft_reply: Optional[str]
    confidence_score: Optional[float]
    suggested_action: Optional[str]

    # Meta
    processing_steps: list[str]
    error: Optional[str]
