"""
Kasparro AI Agent — Background Email Polling Service.

Runs as an asyncio background task inside the FastAPI process.
Every POLL_INTERVAL seconds it:

  1. Fetches unread emails from Gmail
  2. Deduplicates against already-processed gmail_message_ids
  3. Marks each email as read immediately (prevents double processing)
  4. Runs the LangGraph agent pipeline
  5. Auto-resolve path → sends reply + creates ticket (status=auto_resolved)
  6. Human-review path → creates ticket (status=pending) with draft saved

All Node.js API calls go through httpx to the backend service.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog

from src.config.settings import settings
from src.services.gmail_service import GmailService, EmailMessage, gmail_service
from src.services.agent_service import run_agent
from src.models.schemas import EmailAnalysisRequest, LlmProvider

logger = structlog.get_logger(__name__)

POLL_INTERVAL = settings.EMAIL_POLL_INTERVAL
BACKEND_URL = settings.BACKEND_URL
MAX_RETRIES = 3
HTTPX_TIMEOUT = 30.0


class EmailPoller:
    """
    Background service that polls Gmail for new customer emails
    and routes them through the LangGraph agent pipeline.
    """

    def __init__(
        self,
        gmail: GmailService | None = None,
        poll_interval: int = POLL_INTERVAL,
    ) -> None:
        self._gmail = gmail or gmail_service
        self._interval = poll_interval
        self._running = False
        self._task: asyncio.Task | None = None
        self._http: httpx.AsyncClient | None = None

    # ── Lifecycle ────────────────────────────────────────────

    async def start(self) -> None:
        """Start the background polling loop."""
        if self._running:
            logger.warning("poller_already_running")
            return

        self._running = True
        self._http = httpx.AsyncClient(
            base_url=BACKEND_URL,
            timeout=HTTPX_TIMEOUT,
            headers={"Content-Type": "application/json"},
        )

        logger.info(
            "poller_starting",
            interval_seconds=self._interval,
            backend_url=BACKEND_URL,
        )

        self._task = asyncio.create_task(self._loop(), name="email_poller")

    async def stop(self) -> None:
        """Gracefully stop the polling loop."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._http:
            await self._http.aclose()
        logger.info("poller_stopped")

    # ── Main Loop ────────────────────────────────────────────

    async def _loop(self) -> None:
        """Run poll_once every interval, forever."""
        # Wait a bit on startup to let services initialise
        await asyncio.sleep(5)

        while self._running:
            try:
                await self.poll_once()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("poller_loop_error", error=str(exc), exc_info=True)

            await asyncio.sleep(self._interval)

    # ── Poll Once ────────────────────────────────────────────

    async def poll_once(self) -> int:
        """
        Execute a single poll cycle.

        Returns the number of emails successfully processed.
        """
        if not self._gmail.is_connected():
            logger.debug("poller_gmail_not_configured")
            return 0

        logger.info("poller_cycle_start")
        processed = 0

        try:
            emails = await self._gmail.fetch_unread_emails(max_results=50)
        except Exception as exc:
            logger.error("poller_fetch_failed", error=str(exc))
            return 0

        if not emails:
            logger.debug("poller_no_new_emails")
            return 0

        logger.info("poller_emails_found", count=len(emails))

        for email in emails:
            try:
                success = await self._process_email(email)
                if success:
                    processed += 1
            except Exception as exc:
                await self._handle_error(email, exc)

        logger.info("poller_cycle_complete", processed=processed, total=len(emails))
        return processed

    # ── Process Single Email ─────────────────────────────────

    async def _process_email(self, email: EmailMessage) -> bool:
        """
        Process a single email through the full pipeline.

        Returns True if processed successfully.
        """
        log = logger.bind(
            message_id=email.message_id,
            from_email=email.from_email,
            subject=email.subject,
        )

        # 1. Check if already processed (dedup)
        if await self._is_already_processed(email.message_id):
            log.info("poller_skip_duplicate")
            return False

        # 2. Mark as read immediately to prevent double processing
        await self._gmail.mark_as_read(email.message_id)
        log.info("poller_marked_read")

        # 3. Run LangGraph agent
        analysis_request = EmailAnalysisRequest(
            email_body=email.body_plain,
            customer_email=email.from_email,
            customer_name=email.from_name,
            subject=email.subject,
            llm_provider=LlmProvider.GROK,
            gmail_message_id=email.message_id,
        )

        log.info("poller_running_agent")
        result = await run_agent(analysis_request)

        log.info(
            "poller_agent_result",
            category=result.category,
            sentiment=result.sentiment,
            urgency=result.urgency,
            confidence=result.ai_confidence_score,
            auto_resolve=result.auto_resolve,
        )

        # 4. Route based on auto_resolve decision
        if result.auto_resolve:
            await self._handle_auto_resolve(email, result, log)
        else:
            await self._handle_human_review(email, result, log)

        return True

    # ── Auto-Resolve Path ────────────────────────────────────

    async def _handle_auto_resolve(
        self, email: EmailMessage, result: Any, log: Any
    ) -> None:
        """
        Auto-resolve path:
        1. Send reply email via Gmail (in same thread)
        2. Create ticket in backend with status=auto_resolved
        """
        # Send reply
        send_result = await self._gmail.send_email(
            to=email.from_email,
            subject=f"Re: {email.subject}",
            body=result.ai_draft_reply,
            thread_id=email.thread_id,
        )

        if send_result.success:
            log.info("poller_auto_reply_sent", gmail_id=send_result.gmail_message_id)
        else:
            log.error("poller_auto_reply_failed", error=send_result.error)

        # Create ticket in backend
        ticket_data = {
            "customer_email": email.from_email,
            "customer_name": email.from_name,
            "subject": email.subject,
            "original_email_body": email.body_plain,
            "gmail_message_id": email.message_id,
            "category": result.category.value if hasattr(result.category, "value") else str(result.category),
            "sentiment": result.sentiment.value if hasattr(result.sentiment, "value") else str(result.sentiment),
            "urgency": result.urgency.value if hasattr(result.urgency, "value") else str(result.urgency),
            "ai_draft_reply": result.ai_draft_reply,
            "ai_confidence_score": result.ai_confidence_score,
            "ai_suggested_action": result.ai_suggested_action,
            "status": "auto_resolved",
            "auto_resolved": True,
            "final_reply_sent": result.ai_draft_reply if send_result.success else None,
            "llm_provider_used": "grok",
        }

        await self._create_ticket(ticket_data, log)

    # ── Human Review Path ────────────────────────────────────

    async def _handle_human_review(
        self, email: EmailMessage, result: Any, log: Any
    ) -> None:
        """
        Human-review path:
        Create ticket in backend with status=pending and draft saved.
        Manager will review and approve/reject.
        """
        ticket_data = {
            "customer_email": email.from_email,
            "customer_name": email.from_name,
            "subject": email.subject,
            "original_email_body": email.body_plain,
            "gmail_message_id": email.message_id,
            "category": result.category.value if hasattr(result.category, "value") else str(result.category),
            "sentiment": result.sentiment.value if hasattr(result.sentiment, "value") else str(result.sentiment),
            "urgency": result.urgency.value if hasattr(result.urgency, "value") else str(result.urgency),
            "ai_draft_reply": result.ai_draft_reply,
            "ai_confidence_score": result.ai_confidence_score,
            "ai_suggested_action": result.ai_suggested_action,
            "status": "pending",
            "auto_resolved": False,
            "llm_provider_used": "grok",
        }

        await self._create_ticket(ticket_data, log)
        log.info("poller_ticket_pending_review")

    # ── Backend API Calls ────────────────────────────────────

    async def _is_already_processed(self, gmail_message_id: str) -> bool:
        """
        Check if a gmail_message_id has already been processed
        by querying the Node.js backend.
        """
        try:
            resp = await self._http.get(
                "/api/tickets",
                params={"gmail_message_id": gmail_message_id},
            )
            if resp.status_code == 200:
                data = resp.json()
                tickets = data.get("tickets", [])
                return len(tickets) > 0
            return False
        except Exception as exc:
            logger.warning(
                "poller_dedup_check_failed",
                gmail_message_id=gmail_message_id,
                error=str(exc),
            )
            # On failure, allow processing (better to duplicate than miss)
            return False

    async def _create_ticket(self, ticket_data: dict, log: Any) -> None:
        """POST a new ticket to the Node.js backend."""
        for attempt in range(MAX_RETRIES):
            try:
                resp = await self._http.post(
                    "/api/tickets",
                    json=ticket_data,
                )

                if resp.status_code in (200, 201):
                    log.info("poller_ticket_created", status=ticket_data["status"])
                    return
                else:
                    log.warning(
                        "poller_ticket_create_status",
                        status_code=resp.status_code,
                        body=resp.text[:200],
                        attempt=attempt + 1,
                    )

            except Exception as exc:
                log.error(
                    "poller_ticket_create_error",
                    error=str(exc),
                    attempt=attempt + 1,
                )

            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(2 * (attempt + 1))

        log.error("poller_ticket_create_exhausted", data=ticket_data.get("subject"))

    # ── Error Handling ───────────────────────────────────────

    async def _handle_error(
        self, email: EmailMessage, error: Exception
    ) -> None:
        """
        Handle a failed email processing attempt.
        Log the error and POST to the email_processing_queue
        for retry via the Node.js backend.
        """
        logger.error(
            "poller_email_processing_failed",
            message_id=email.message_id,
            from_email=email.from_email,
            subject=email.subject,
            error=str(error),
            exc_info=True,
        )

        try:
            queue_data = {
                "gmail_message_id": email.message_id,
                "raw_email_data": {
                    "from": email.from_email,
                    "from_name": email.from_name,
                    "subject": email.subject,
                    "body_preview": email.body_plain[:500],
                    "received_at": email.received_at,
                    "thread_id": email.thread_id,
                },
                "status": "failed",
                "error_message": str(error),
                "retry_count": 0,
                "max_retries": MAX_RETRIES,
            }

            await self._http.post(
                "/api/email/queue",
                json=queue_data,
            )
            logger.info(
                "poller_queued_for_retry",
                message_id=email.message_id,
            )
        except Exception as queue_exc:
            logger.error(
                "poller_queue_failed",
                message_id=email.message_id,
                error=str(queue_exc),
            )


# ── Singleton ────────────────────────────────────────────────
email_poller = EmailPoller()
