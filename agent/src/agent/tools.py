"""
Kasparro AI Agent — LangChain Tools.

Callable tools that the LangGraph agent can invoke during
email processing. Currently return realistic mock data;
replace with live integrations when ready.
"""

from __future__ import annotations

import structlog
from langchain_core.tools import tool

logger = structlog.get_logger(__name__)

# ═════════════════════════════════════════════════════════════
# 1.  Order Tracking
# ═════════════════════════════════════════════════════════════

@tool
def get_order_tracking(order_id: str) -> str:
    """
    Look up the shipping/tracking status of a customer order.

    Args:
        order_id: The order identifier (e.g. ORD-29481).

    Returns:
        A human-readable tracking summary.
    """
    logger.info("tool_order_tracking", order_id=order_id)

    # Mock data — replace with real DB / carrier API
    tracking_db = {
        "ORD-29481": {
            "status": "Shipped",
            "carrier": "FedEx",
            "tracking": "FX-7489203847102",
            "eta": "May 22, 2025",
            "last_location": "Distribution Center, Dallas TX",
        },
        "ORD-30122": {
            "status": "In Transit",
            "carrier": "UPS",
            "tracking": "1Z999AA10123456784",
            "eta": "May 20, 2025",
            "last_location": "Regional Hub, Portland OR",
        },
        "ORD-31200": {
            "status": "Processing",
            "carrier": "Pending",
            "tracking": "Not yet assigned",
            "eta": "2-3 business days after shipment",
            "last_location": "Warehouse",
        },
    }

    info = tracking_db.get(order_id)
    if info:
        return (
            f"Order {order_id}:\n"
            f"  Status: {info['status']}\n"
            f"  Carrier: {info['carrier']}\n"
            f"  Tracking Number: {info['tracking']}\n"
            f"  Estimated Delivery: {info['eta']}\n"
            f"  Last Known Location: {info['last_location']}"
        )

    return (
        f"Order {order_id}: Status information is currently unavailable. "
        f"Please allow 24-48 hours for tracking updates after shipment."
    )


# ═════════════════════════════════════════════════════════════
# 2.  Company Policy
# ═════════════════════════════════════════════════════════════

@tool
def get_company_policy(policy_topic: str) -> str:
    """
    Retrieve the company policy text for a given topic.

    Args:
        policy_topic: One of 'refund', 'return', 'shipping',
                      'warranty', 'exchange', 'cancellation'.

    Returns:
        The full policy text for that topic.
    """
    logger.info("tool_company_policy", topic=policy_topic)

    policies = {
        "refund": (
            "REFUND POLICY:\n"
            "• Full refunds are available within 30 days of delivery.\n"
            "• Refunds are processed to the original payment method.\n"
            "• Processing time: 5-7 business days after approval.\n"
            "• Defective items receive immediate refunds regardless of time.\n"
            "• Digital products are non-refundable after download."
        ),
        "return": (
            "RETURN POLICY:\n"
            "• 30-day return window from date of delivery.\n"
            "• Items must be in unused/unworn condition with tags attached.\n"
            "• Original packaging preferred but not required.\n"
            "• Free return shipping on all domestic orders.\n"
            "• International return shipping is customer's responsibility.\n"
            "• Initiate returns at kasparro.com/account → Order History."
        ),
        "shipping": (
            "SHIPPING POLICY:\n"
            "• Standard shipping: 5-7 business days (free over $50).\n"
            "• Express shipping: 2-3 business days ($12.99).\n"
            "• Overnight shipping: next business day ($24.99).\n"
            "• International shipping: 7-14 business days (varies).\n"
            "• Customs/import duties are recipient's responsibility.\n"
            "• Orders placed before 2 PM EST ship same day."
        ),
        "warranty": (
            "WARRANTY POLICY:\n"
            "• 1-year manufacturer warranty on all electronics.\n"
            "• 6-month warranty on clothing and accessories.\n"
            "• Warranty covers manufacturing defects only.\n"
            "• Does not cover normal wear and tear or user damage.\n"
            "• Contact support with proof of purchase to file a claim."
        ),
        "exchange": (
            "EXCHANGE POLICY:\n"
            "• Free exchanges within 30 days of delivery.\n"
            "• Size and color exchanges are shipped at no cost.\n"
            "• Different product exchanges follow standard return + new order.\n"
            "• Exchange items ship within 1-2 business days of receiving return."
        ),
        "cancellation": (
            "CANCELLATION POLICY:\n"
            "• Orders can be cancelled within 1 hour of placement.\n"
            "• After 1 hour, cancellation depends on shipping status.\n"
            "• Un-shipped orders: full refund, cancelled immediately.\n"
            "• Shipped orders: must follow standard return process.\n"
            "• Cancel at kasparro.com/account or contact support."
        ),
    }

    topic = policy_topic.lower().strip()
    if topic in policies:
        return policies[topic]

    available = ", ".join(policies.keys())
    return (
        f"Policy '{policy_topic}' not found. "
        f"Available policies: {available}"
    )


# ═════════════════════════════════════════════════════════════
# 3.  FAQ Knowledge Base
# ═════════════════════════════════════════════════════════════

@tool
def get_faq_answer(keyword: str) -> str:
    """
    Search the FAQ knowledge base for an answer by keyword.

    Args:
        keyword: A topic keyword such as 'account', 'password',
                 'payment', 'sizing', 'subscription'.

    Returns:
        The matching FAQ answer.
    """
    logger.info("tool_faq_search", keyword=keyword)

    faq_db = {
        "account": (
            "Q: How do I update my account information?\n"
            "A: Log in → Account Settings → Personal Information. "
            "You can update your name, email, phone, and address. "
            "Email changes require verification via confirmation link."
        ),
        "password": (
            "Q: How do I reset my password?\n"
            "A: Click 'Forgot Password' on the login page. "
            "Enter your email and we'll send a reset link. "
            "Link expires in 24 hours. Contact support if issues persist."
        ),
        "payment": (
            "Q: What payment methods do you accept?\n"
            "A: We accept Visa, Mastercard, American Express, "
            "Discover, PayPal, Apple Pay, Google Pay, and Klarna "
            "(buy now, pay later). All transactions are encrypted."
        ),
        "sizing": (
            "Q: How do I find my size?\n"
            "A: Use our size guide at kasparro.com/size-guide. "
            "Each product page has a 'Size Chart' button with "
            "detailed measurements in inches and centimeters. "
            "When in doubt, size up — free exchanges available."
        ),
        "subscription": (
            "Q: How do I manage my subscription?\n"
            "A: Go to Account → Subscriptions. You can pause, skip, "
            "modify, or cancel anytime. Changes take effect on your "
            "next billing cycle. No cancellation fees."
        ),
        "gift_card": (
            "Q: How do gift cards work?\n"
            "A: Gift cards are delivered via email with a unique code. "
            "They never expire and can be used on any product. "
            "Remaining balance carries over for future purchases."
        ),
    }

    kw = keyword.lower().strip()
    for key, answer in faq_db.items():
        if kw in key or key in kw:
            return answer

    return (
        f"No FAQ found for '{keyword}'. "
        f"Available topics: {', '.join(faq_db.keys())}. "
        f"For further assistance, a human agent will review your request."
    )


# ── Export all tools ─────────────────────────────────────────

AGENT_TOOLS = [
    get_order_tracking,
    get_company_policy,
    get_faq_answer,
]
