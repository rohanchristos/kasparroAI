"""
Kasparro AI Agent — LangGraph Node Functions.

Each async function is a node in the processing graph.
It receives the current AgentState and returns a dict of
state updates to merge back.

Prompts are defined as module-level constants for clarity.
"""

from __future__ import annotations

import json
from typing import Any

import structlog
from langchain_core.messages import HumanMessage, SystemMessage

from src.agent.state import AgentState
from src.services.llm_service import get_llm

logger = structlog.get_logger(__name__)


# ═════════════════════════════════════════════════════════════
# PROMPTS
# ═════════════════════════════════════════════════════════════

CLASSIFY_SYSTEM_PROMPT = """\
You are Kasparro AI, an expert customer-support email classifier.

Analyze the following customer email and return a JSON object with \
EXACTLY these fields (no markdown fences, no extra text):

{
  "category": "<one of: refund, tracking, damaged_product, wrong_item, complaint, faq, policy, other>",
  "sentiment": "<one of: angry, frustrated, neutral, positive>",
  "urgency": "<one of: high, medium, low>",
  "intent_details": {
    "primary_intent": "<1-sentence summary of what the customer wants>",
    "key_issues": ["<issue 1>", "<issue 2>"],
    "order_numbers": ["<ORD-XXXXX if mentioned>"],
    "monetary_amounts": ["<$XX.XX if mentioned>"],
    "requires_action": "<what concrete action is needed>"
  }
}

Classification rules:
- "refund": customer explicitly asks for money back
- "tracking": customer asks where their package is
- "damaged_product": item arrived broken or defective
- "wrong_item": received different item than ordered
- "complaint": general dissatisfaction or service complaint
- "faq": common question (account, password, sizing, payment)
- "policy": question about policies (return, shipping, warranty)
- "other": does not fit any above category

Sentiment rules:
- "angry": ALL CAPS, threats, profanity, demands
- "frustrated": repeated contact, disappointment, exasperation
- "neutral": factual tone, simple inquiry
- "positive": thanks, praise, happy

Urgency rules:
- "high": angry/frustrated + refund/damaged/complaint, threats of chargeback/legal
- "medium": standard requests needing attention
- "low": simple questions, positive feedback, FAQs

Example output:
{
  "category": "refund",
  "sentiment": "angry",
  "urgency": "high",
  "intent_details": {
    "primary_intent": "Customer demands a full refund for a wrong item",
    "key_issues": ["Received polyester jacket instead of leather", "Threatens BBB complaint"],
    "order_numbers": ["ORD-29481"],
    "monetary_amounts": ["$189.99"],
    "requires_action": "Process full refund and arrange return pickup"
  }
}
"""

DRAFT_AUTO_SYSTEM_PROMPT = """\
You are Kasparro AI, a friendly and professional customer support agent.

Write a reply email for a {category} inquiry. The customer's sentiment \
is {sentiment} with {urgency} urgency.

Rules:
- Be warm, empathetic, and concise.
- Address the customer by name.
- For TRACKING: provide the tracking information and estimated delivery.
- For FAQ: provide a clear, complete answer.
- For POLICY: cite the specific policy details.
- For positive sentiment: thank them warmly.
- Include specific next steps when applicable.
- Sign as "Kasparro Customer Support Team".
- Do NOT use placeholder brackets like [AMOUNT] — use general language instead.

Return ONLY a JSON object (no markdown fences):
{{
  "draft_reply": "<the complete email reply>",
  "confidence_score": <float 0.85-0.99>,
  "suggested_action": "<brief action summary>"
}}

Example:
{{
  "draft_reply": "Hi John,\\n\\nThank you for reaching out! ...",
  "confidence_score": 0.95,
  "suggested_action": "Auto-resolve: standard tracking inquiry"
}}
"""

DRAFT_HUMAN_SYSTEM_PROMPT = """\
You are Kasparro AI, drafting a reply that a human manager will \
review before sending. The category is {category}, sentiment is \
{sentiment}, urgency is {urgency}.

Rules:
- Be empathetic and professional.
- Address the customer by name.
- Where you need manager input, use [MANAGER ACTION NEEDED: description] placeholders.
  Examples:
    - "We will process your refund of [MANAGER ACTION NEEDED: confirm refund amount] within [MANAGER ACTION NEEDED: specify timeframe] business days."
    - "I have arranged for a replacement to be shipped [MANAGER ACTION NEEDED: confirm replacement details]."
- Provide your best guess but flag it for review.
- Include specific details from the email (order numbers, items, etc.).
- Sign as "Kasparro Customer Support Team".

Return ONLY a JSON object (no markdown fences):
{{
  "draft_reply": "<complete email with [MANAGER ACTION NEEDED] placeholders>",
  "confidence_score": <float 0.50-0.75>,
  "suggested_action": "<detailed action items for the manager>"
}}

Example:
{{
  "draft_reply": "Dear Maria,\\n\\nI sincerely apologize for this experience...\\n\\nWe are processing a refund of [MANAGER ACTION NEEDED: confirm full refund of $189.99] to your original payment method...\\n\\nKasparro Customer Support Team",
  "confidence_score": 0.65,
  "suggested_action": "MANAGER: Approve refund of $189.99. Arrange prepaid return label. Consider goodwill discount."
}}
"""

QUALITY_CHECK_SYSTEM_PROMPT = """\
You are a quality-assurance reviewer for customer support emails.

Review the following draft reply to a customer email and evaluate it.

Customer email subject: {subject}
Category: {category} | Sentiment: {sentiment} | Urgency: {urgency}

Return ONLY a JSON object (no markdown fences):
{{
  "is_professional": <true/false>,
  "is_empathetic": <true/false>,
  "addresses_complaint": <true/false>,
  "has_clear_next_steps": <true/false>,
  "quality_score": <float 0.0-1.0>,
  "issues": ["<issue if any>"],
  "improved_reply": "<if quality_score < 0.7, provide an improved version; otherwise null>"
}}
"""


# ═════════════════════════════════════════════════════════════
# NODE 1 — Classify Email
# ═════════════════════════════════════════════════════════════

async def classify_email_node(state: AgentState) -> dict[str, Any]:
    """
    Classify the incoming customer email using LLM.

    Sets: category, sentiment, urgency, intent_details
    """
    logger.info(
        "node_classify_start",
        subject=state.get("subject"),
        provider=state.get("llm_provider"),
    )

    try:
        llm = get_llm(state["llm_provider"])

        user_content = (
            f"Customer Name: {state.get('customer_name', 'Unknown')}\n"
            f"Customer Email: {state.get('customer_email', '')}\n"
            f"Subject: {state.get('subject', '')}\n\n"
            f"Email Body:\n{state['email_body']}"
        )

        response = await llm.ainvoke([
            SystemMessage(content=CLASSIFY_SYSTEM_PROMPT),
            HumanMessage(content=user_content),
        ])

        parsed = _parse_json(response.content)

        logger.info(
            "node_classify_complete",
            category=parsed.get("category"),
            sentiment=parsed.get("sentiment"),
            urgency=parsed.get("urgency"),
        )

        steps = list(state.get("processing_steps", []))
        steps.append(f"classify_email: {parsed.get('category')} / {parsed.get('sentiment')} / {parsed.get('urgency')}")

        return {
            "category": parsed.get("category", "other"),
            "sentiment": parsed.get("sentiment", "neutral"),
            "urgency": parsed.get("urgency", "medium"),
            "intent_details": parsed.get("intent_details", {}),
            "processing_steps": steps,
        }

    except Exception as exc:
        logger.error("node_classify_error", error=str(exc))
        steps = list(state.get("processing_steps", []))
        steps.append(f"classify_email: FAILED — {str(exc)}")
        return {
            "category": "other",
            "sentiment": "neutral",
            "urgency": "medium",
            "intent_details": {},
            "error": f"Classification failed: {str(exc)}",
            "processing_steps": steps,
        }


# ═════════════════════════════════════════════════════════════
# NODE 2 — Route Decision (pure logic, no LLM)
# ═════════════════════════════════════════════════════════════

async def route_decision_node(state: AgentState) -> dict[str, Any]:
    """
    Decide whether the ticket can be auto-resolved or needs human review.

    Business rules applied here — no LLM call.
    """
    category = state.get("category", "other")
    sentiment = state.get("sentiment", "neutral")
    urgency = state.get("urgency", "medium")
    confidence = state.get("confidence_score")

    # Categories that ALWAYS need human review
    human_required_categories = {
        "refund",
        "damaged_product",
        "wrong_item",
    }

    # Complaint + angry/frustrated → human
    complaint_needs_human = (
        category == "complaint"
        and sentiment in ("angry", "frustrated")
    )

    # Low confidence → human
    low_confidence = confidence is not None and confidence < 0.7

    needs_human = (
        category in human_required_categories
        or complaint_needs_human
        or low_confidence
    )

    # Auto-resolve eligible categories
    auto_resolve_categories = {"tracking", "faq", "policy"}
    can_auto = (
        category in auto_resolve_categories
        or sentiment == "positive"
    ) and not needs_human

    # Build reason
    if needs_human:
        reasons = []
        if category in human_required_categories:
            reasons.append(f"category '{category}' requires manager approval")
        if complaint_needs_human:
            reasons.append(f"complaint with {sentiment} sentiment needs human review")
        if low_confidence:
            reasons.append(f"confidence ({confidence:.2f}) below 0.7 threshold")
        reason = "Human review required: " + "; ".join(reasons)
    else:
        reason = f"Auto-resolve eligible: {category} with {sentiment} sentiment"

    logger.info(
        "node_route_decision",
        auto_resolve=can_auto,
        requires_human=needs_human,
        reason=reason,
    )

    steps = list(state.get("processing_steps", []))
    steps.append(f"route_decision: {'auto_resolve' if can_auto else 'human_review'}")

    return {
        "auto_resolve": can_auto,
        "requires_human": needs_human,
        "auto_resolve_reason": reason,
        "processing_steps": steps,
    }


# ═════════════════════════════════════════════════════════════
# NODE 3 — Draft Auto-Resolve Reply
# ═════════════════════════════════════════════════════════════

async def draft_auto_reply_node(state: AgentState) -> dict[str, Any]:
    """
    Generate a draft reply for auto-resolvable tickets.

    Called only when auto_resolve is True (tracking, FAQ, policy, positive).
    """
    logger.info(
        "node_draft_auto_start",
        category=state.get("category"),
    )

    try:
        llm = get_llm(state["llm_provider"])

        system = DRAFT_AUTO_SYSTEM_PROMPT.format(
            category=state.get("category", "other"),
            sentiment=state.get("sentiment", "neutral"),
            urgency=state.get("urgency", "low"),
        )

        user_content = (
            f"Customer Name: {state.get('customer_name', 'Customer')}\n"
            f"Subject: {state.get('subject', '')}\n\n"
            f"Customer Email:\n{state['email_body']}\n\n"
            f"Intent Details: {json.dumps(state.get('intent_details', {}))}"
        )

        response = await llm.ainvoke([
            SystemMessage(content=system),
            HumanMessage(content=user_content),
        ])

        parsed = _parse_json(response.content)

        steps = list(state.get("processing_steps", []))
        steps.append(f"draft_auto_reply: confidence={parsed.get('confidence_score', 0.9)}")

        return {
            "draft_reply": parsed.get("draft_reply", ""),
            "confidence_score": float(parsed.get("confidence_score", 0.9)),
            "suggested_action": parsed.get("suggested_action", "Auto-resolve and send"),
            "processing_steps": steps,
        }

    except Exception as exc:
        logger.error("node_draft_auto_error", error=str(exc))
        name = state.get("customer_name", "Customer")
        steps = list(state.get("processing_steps", []))
        steps.append(f"draft_auto_reply: FAILED — {str(exc)}")
        return {
            "draft_reply": (
                f"Dear {name},\n\n"
                f"Thank you for reaching out to us regarding \"{state.get('subject', 'your inquiry')}\".\n\n"
                f"We have received your message and are looking into it. "
                f"You can expect a response within 24 hours.\n\n"
                f"Best regards,\n"
                f"Kasparro Customer Support Team"
            ),
            "confidence_score": 0.5,
            "suggested_action": "Fallback template sent — review manually",
            "error": f"Auto-draft failed: {str(exc)}",
            "processing_steps": steps,
        }


# ═════════════════════════════════════════════════════════════
# NODE 4 — Draft Human-Review Reply
# ═════════════════════════════════════════════════════════════

async def draft_human_review_reply_node(state: AgentState) -> dict[str, Any]:
    """
    Generate a draft reply with [MANAGER ACTION NEEDED] placeholders
    for tickets that require human review.
    """
    logger.info(
        "node_draft_human_start",
        category=state.get("category"),
        sentiment=state.get("sentiment"),
    )

    try:
        llm = get_llm(state["llm_provider"])

        system = DRAFT_HUMAN_SYSTEM_PROMPT.format(
            category=state.get("category", "other"),
            sentiment=state.get("sentiment", "neutral"),
            urgency=state.get("urgency", "medium"),
        )

        user_content = (
            f"Customer Name: {state.get('customer_name', 'Customer')}\n"
            f"Customer Email: {state.get('customer_email', '')}\n"
            f"Subject: {state.get('subject', '')}\n\n"
            f"Customer Email Body:\n{state['email_body']}\n\n"
            f"Intent Details: {json.dumps(state.get('intent_details', {}))}\n\n"
            f"IMPORTANT: This is a {state.get('category')} case with "
            f"{state.get('sentiment')} sentiment. Draft a thorough reply "
            f"with [MANAGER ACTION NEEDED] for any decisions involving money, "
            f"replacements, or exceptions."
        )

        response = await llm.ainvoke([
            SystemMessage(content=system),
            HumanMessage(content=user_content),
        ])

        parsed = _parse_json(response.content)

        steps = list(state.get("processing_steps", []))
        steps.append(f"draft_human_review: confidence={parsed.get('confidence_score', 0.6)}")

        return {
            "draft_reply": parsed.get("draft_reply", ""),
            "confidence_score": float(parsed.get("confidence_score", 0.6)),
            "suggested_action": parsed.get("suggested_action", "Manager review required"),
            "processing_steps": steps,
        }

    except Exception as exc:
        logger.error("node_draft_human_error", error=str(exc))
        name = state.get("customer_name", "Customer")
        steps = list(state.get("processing_steps", []))
        steps.append(f"draft_human_review: FAILED — {str(exc)}")
        return {
            "draft_reply": (
                f"Dear {name},\n\n"
                f"Thank you for contacting us about \"{state.get('subject', 'your concern')}\".\n\n"
                f"We take your feedback seriously and a senior support manager "
                f"is personally reviewing your case. You will receive a detailed "
                f"response within [MANAGER ACTION NEEDED: specify response timeframe].\n\n"
                f"We appreciate your patience.\n\n"
                f"Sincerely,\n"
                f"Kasparro Customer Support Team"
            ),
            "confidence_score": 0.3,
            "suggested_action": "URGENT: AI draft failed. Manager must write custom response.",
            "error": f"Human-review draft failed: {str(exc)}",
            "processing_steps": steps,
        }


# ═════════════════════════════════════════════════════════════
# NODE 5 — Quality Check
# ═════════════════════════════════════════════════════════════

async def quality_check_node(state: AgentState) -> dict[str, Any]:
    """
    Review the draft reply for quality: professionalism, empathy,
    completeness. If quality is poor, replace with improved version.
    """
    logger.info("node_quality_check_start")

    draft = state.get("draft_reply", "")
    if not draft:
        steps = list(state.get("processing_steps", []))
        steps.append("quality_check: SKIPPED — no draft to review")
        return {"processing_steps": steps}

    try:
        llm = get_llm(state["llm_provider"])

        system = QUALITY_CHECK_SYSTEM_PROMPT.format(
            subject=state.get("subject", ""),
            category=state.get("category", "other"),
            sentiment=state.get("sentiment", "neutral"),
            urgency=state.get("urgency", "medium"),
        )

        user_content = (
            f"Original customer email:\n{state['email_body']}\n\n"
            f"---\n\n"
            f"Draft reply to review:\n{draft}"
        )

        response = await llm.ainvoke([
            SystemMessage(content=system),
            HumanMessage(content=user_content),
        ])

        parsed = _parse_json(response.content)

        quality_score = float(parsed.get("quality_score", 0.8))
        issues = parsed.get("issues", [])
        improved = parsed.get("improved_reply")

        steps = list(state.get("processing_steps", []))

        # If quality is poor and we have an improved version, use it
        if quality_score < 0.7 and improved:
            logger.info(
                "node_quality_check_replaced",
                original_score=quality_score,
                issues=issues,
            )
            steps.append(f"quality_check: REPLACED (score={quality_score:.2f}, issues={issues})")

            # Adjust confidence down since we needed to fix it
            current_confidence = state.get("confidence_score", 0.5)
            adjusted = max(current_confidence - 0.1, 0.3)

            return {
                "draft_reply": improved,
                "confidence_score": adjusted,
                "processing_steps": steps,
            }

        logger.info(
            "node_quality_check_passed",
            score=quality_score,
        )
        steps.append(f"quality_check: PASSED (score={quality_score:.2f})")

        return {"processing_steps": steps}

    except Exception as exc:
        logger.error("node_quality_check_error", error=str(exc))
        steps = list(state.get("processing_steps", []))
        steps.append(f"quality_check: SKIPPED due to error — {str(exc)}")
        return {"processing_steps": steps}


# ═════════════════════════════════════════════════════════════
# NODE 6 — Finalize
# ═════════════════════════════════════════════════════════════

async def finalize_node(state: AgentState) -> dict[str, Any]:
    """
    Package the final response. Ensure all required fields are set.
    """
    logger.info("node_finalize")

    steps = list(state.get("processing_steps", []))
    steps.append("finalize: complete")

    # Ensure defaults
    result: dict[str, Any] = {
        "processing_steps": steps,
    }

    if not state.get("draft_reply"):
        result["draft_reply"] = (
            f"Dear {state.get('customer_name', 'Customer')},\n\n"
            f"Thank you for contacting Kasparro support. We have received "
            f"your message and will respond shortly.\n\n"
            f"Best regards,\n"
            f"Kasparro Customer Support Team"
        )
        result["confidence_score"] = 0.0
        result["suggested_action"] = "No draft generated — manual response required"

    if state.get("confidence_score") is None:
        result["confidence_score"] = 0.5

    if not state.get("suggested_action"):
        result["suggested_action"] = (
            "Review and approve" if state.get("requires_human") else "Auto-send"
        )

    return result


# ═════════════════════════════════════════════════════════════
# HELPERS
# ═════════════════════════════════════════════════════════════

def _parse_json(raw: str) -> dict:
    """
    Parse JSON from LLM output, stripping markdown fences and
    extracting the JSON object.
    """
    cleaned = raw.strip()

    # Strip markdown fences
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = lines[1:]  # remove opening fence
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]  # remove closing fence
        cleaned = "\n".join(lines).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Extract first JSON object
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start:end])
            except json.JSONDecodeError:
                pass
        raise ValueError(f"Cannot parse LLM JSON: {raw[:300]}")
