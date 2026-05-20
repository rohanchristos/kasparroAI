"""
Kasparro AI Agent — LangGraph Graph Definition.

Builds and compiles the email-processing state graph with
conditional routing between auto-resolve and human-review paths.

Pipeline:
  START → classify_email → route_decision ─┬─→ draft_auto_reply ──→ quality_check → finalize → END
                                            └─→ draft_human_review ─┘
"""

from __future__ import annotations

import structlog
from langgraph.graph import StateGraph, START, END

from src.agent.state import AgentState
from src.agent.nodes import (
    classify_email_node,
    route_decision_node,
    draft_auto_reply_node,
    draft_human_review_reply_node,
    quality_check_node,
    finalize_node,
)

logger = structlog.get_logger(__name__)


def _route_after_decision(state: AgentState) -> str:
    """
    Conditional edge: choose the drafting path based on routing decision.

    Returns the name of the next node.
    """
    if state.get("auto_resolve"):
        return "draft_auto_reply"
    return "draft_human_review"


def build_graph() -> StateGraph:
    """
    Construct and compile the email-processing LangGraph.

    Graph topology:

        ┌──────────────┐
        │    START      │
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │classify_email│
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │route_decision │
        └──┬────────┬──┘
           │        │
      auto_resolve  requires_human
           │        │
           ▼        ▼
    ┌────────────┐ ┌───────────────┐
    │draft_auto  │ │draft_human    │
    │_reply      │ │_review        │
    └─────┬──────┘ └──────┬────────┘
          │               │
          └───────┬───────┘
                  ▼
         ┌──────────────┐
         │quality_check │
         └──────┬───────┘
                ▼
         ┌──────────────┐
         │   finalize   │
         └──────┬───────┘
                ▼
         ┌──────────────┐
         │     END      │
         └──────────────┘
    """

    graph = StateGraph(AgentState)

    # ── Register nodes ───────────────────────────────────────
    graph.add_node("classify_email", classify_email_node)
    graph.add_node("route_decision", route_decision_node)
    graph.add_node("draft_auto_reply", draft_auto_reply_node)
    graph.add_node("draft_human_review", draft_human_review_reply_node)
    graph.add_node("quality_check", quality_check_node)
    graph.add_node("finalize", finalize_node)

    # ── Wire edges ───────────────────────────────────────────
    graph.add_edge(START, "classify_email")
    graph.add_edge("classify_email", "route_decision")

    # Conditional branching after route_decision
    graph.add_conditional_edges(
        "route_decision",
        _route_after_decision,
        {
            "draft_auto_reply": "draft_auto_reply",
            "draft_human_review": "draft_human_review",
        },
    )

    # Both drafting paths converge into quality_check
    graph.add_edge("draft_auto_reply", "quality_check")
    graph.add_edge("draft_human_review", "quality_check")

    graph.add_edge("quality_check", "finalize")
    graph.add_edge("finalize", END)

    # ── Compile ──────────────────────────────────────────────
    compiled = graph.compile()

    logger.info(
        "langgraph_compiled",
        nodes=["classify_email", "route_decision", "draft_auto_reply",
               "draft_human_review", "quality_check", "finalize"],
        conditional_edges=["route_decision → draft_auto_reply | draft_human_review"],
    )

    return compiled


# Pre-compiled singleton — ready to invoke
compiled_graph = build_graph()
