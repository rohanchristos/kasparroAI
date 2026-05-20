"""
Kasparro AI Agent — Gmail Service (Production).

Full Gmail API integration with OAuth2 refresh-token auth,
multipart email parsing, thread-aware sending, and retry logic.
"""

from __future__ import annotations

import asyncio
import base64
import re
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional

import structlog
from bs4 import BeautifulSoup
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pydantic import BaseModel

from src.config.settings import settings

logger = structlog.get_logger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
]

MAX_BODY_SIZE = 50 * 1024  # 50 KB — skip oversized emails
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds


# ── Data Models ──────────────────────────────────────────────

class EmailMessage(BaseModel):
    """Parsed email from the Gmail inbox."""
    message_id: str
    from_email: str
    from_name: str
    subject: str
    body_plain: str
    body_html: str
    received_at: str
    thread_id: str


class SendResult(BaseModel):
    """Result of sending an email."""
    success: bool
    gmail_message_id: Optional[str] = None
    sent_at: Optional[datetime] = None
    error: Optional[str] = None


class SenderInfo(BaseModel):
    """Parsed sender information."""
    name: str
    email: str


# ── Gmail Service ────────────────────────────────────────────

class GmailService:
    """
    Production Gmail API client with OAuth2, retry logic,
    and intelligent email parsing.
    """

    def __init__(self) -> None:
        self._service = None
        self._credentials: Credentials | None = None
        self._lock = asyncio.Lock()

    # ── Connection Status ────────────────────────────────────

    def is_connected(self) -> bool:
        """Check if Gmail credentials are configured (not a live check)."""
        return bool(
            settings.GMAIL_CLIENT_ID
            and settings.GMAIL_CLIENT_SECRET
            and settings.GMAIL_REFRESH_TOKEN
            and settings.GMAIL_CLIENT_ID != "CHANGE_ME.apps.googleusercontent.com"
        )

    # ── Auth ─────────────────────────────────────────────────

    async def authenticate(self):
        """
        Build or refresh the Gmail API service object.
        Thread-safe via asyncio.Lock.
        """
        async with self._lock:
            if self._service is not None and self._credentials and self._credentials.valid:
                return self._service

            if not self.is_connected():
                raise RuntimeError(
                    "Gmail credentials not configured. "
                    "Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and "
                    "GMAIL_REFRESH_TOKEN in .env"
                )

            logger.info("gmail_authenticating")

            self._credentials = Credentials(
                token=None,
                refresh_token=settings.GMAIL_REFRESH_TOKEN,
                client_id=settings.GMAIL_CLIENT_ID,
                client_secret=settings.GMAIL_CLIENT_SECRET,
                token_uri="https://oauth2.googleapis.com/token",
                scopes=SCOPES,
            )

            # Run blocking refresh in executor to keep async
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None, self._credentials.refresh, GoogleAuthRequest()
            )

            self._service = await loop.run_in_executor(
                None,
                lambda: build("gmail", "v1", credentials=self._credentials),
            )

            logger.info("gmail_authenticated")
            return self._service

    async def _get_service(self):
        """Get or create the Gmail service, refreshing if needed."""
        if (
            self._service is not None
            and self._credentials
            and self._credentials.valid
        ):
            return self._service
        return await self.authenticate()

    # ── Fetch Unread Emails ──────────────────────────────────

    async def fetch_unread_emails(
        self, max_results: int = 50
    ) -> list[EmailMessage]:
        """
        Fetch unread emails from the Gmail inbox.

        Skips emails with body > 50 KB.
        Returns parsed EmailMessage objects.
        """
        service = await self._get_service()
        loop = asyncio.get_running_loop()

        try:
            results = await loop.run_in_executor(
                None,
                lambda: service.users()
                .messages()
                .list(
                    userId="me",
                    maxResults=max_results,
                    labelIds=["INBOX"],
                    q="is:unread",
                )
                .execute(),
            )

            message_refs = results.get("messages", [])
            if not message_refs:
                logger.debug("gmail_no_unread")
                return []

            emails: list[EmailMessage] = []
            for ref in message_refs:
                email = await self._fetch_single_email(service, ref["id"], loop)
                if email:
                    emails.append(email)

            logger.info("gmail_fetched", count=len(emails), total_unread=len(message_refs))
            return emails

        except HttpError as exc:
            logger.error("gmail_fetch_http_error", status=exc.resp.status, error=str(exc))
            raise
        except Exception as exc:
            logger.error("gmail_fetch_error", error=str(exc))
            raise

    async def _fetch_single_email(
        self, service: Any, message_id: str, loop
    ) -> EmailMessage | None:
        """Fetch and parse a single Gmail message with retry."""
        for attempt in range(MAX_RETRIES):
            try:
                msg = await loop.run_in_executor(
                    None,
                    lambda mid=message_id: service.users()
                    .messages()
                    .get(userId="me", id=mid, format="full")
                    .execute(),
                )

                headers = {
                    h["name"].lower(): h["value"]
                    for h in msg.get("payload", {}).get("headers", [])
                }

                # Parse sender
                sender = self.extract_sender_info(headers)

                # Parse body
                body_plain, body_html = self.parse_email_body(
                    msg.get("payload", {})
                )

                # Skip oversized emails
                if len(body_plain) > MAX_BODY_SIZE:
                    logger.warning(
                        "gmail_email_too_large",
                        message_id=message_id,
                        size=len(body_plain),
                    )
                    return None

                # Clean the body
                body_plain = self._clean_email_body(body_plain)

                return EmailMessage(
                    message_id=msg["id"],
                    from_email=sender.email,
                    from_name=sender.name,
                    subject=headers.get("subject", "(no subject)"),
                    body_plain=body_plain,
                    body_html=body_html,
                    received_at=headers.get("date", ""),
                    thread_id=msg.get("threadId", msg["id"]),
                )

            except HttpError as exc:
                if exc.resp.status == 429:
                    # Rate limited — back off
                    wait = RETRY_DELAY * (attempt + 1)
                    logger.warning(
                        "gmail_rate_limited",
                        message_id=message_id,
                        attempt=attempt + 1,
                        wait=wait,
                    )
                    await asyncio.sleep(wait)
                    continue
                logger.error(
                    "gmail_message_error",
                    message_id=message_id,
                    status=exc.resp.status,
                )
                return None
            except Exception as exc:
                logger.error(
                    "gmail_message_parse_error",
                    message_id=message_id,
                    error=str(exc),
                )
                return None

        return None

    # ── Get Single Email ─────────────────────────────────────

    async def get_email_by_id(self, message_id: str) -> EmailMessage | None:
        """Fetch a single email by its Gmail message ID."""
        service = await self._get_service()
        loop = asyncio.get_running_loop()
        return await self._fetch_single_email(service, message_id, loop)

    # ── Send Email ───────────────────────────────────────────

    async def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        thread_id: str | None = None,
        ticket_id: str | None = None,
    ) -> SendResult:
        """
        Send an email via the Gmail API.

        If thread_id is provided, the email is sent as a reply
        within the same conversation thread.
        """
        service = await self._get_service()
        loop = asyncio.get_running_loop()

        for attempt in range(MAX_RETRIES):
            try:
                message = MIMEMultipart("alternative")
                message["to"] = to
                message["subject"] = subject

                if ticket_id:
                    message["X-Kasparro-Ticket-ID"] = ticket_id

                # Plain text
                message.attach(MIMEText(body, "plain"))

                # HTML version
                html_lines = body.replace("\n", "<br>")
                html_body = (
                    '<html><body style="font-family: \'Segoe UI\', Arial, '
                    'sans-serif; line-height: 1.6; color: #333;">'
                    f"{html_lines}</body></html>"
                )
                message.attach(MIMEText(html_body, "html"))

                raw = base64.urlsafe_b64encode(
                    message.as_bytes()
                ).decode("utf-8")

                send_body: dict[str, Any] = {"raw": raw}
                if thread_id:
                    send_body["threadId"] = thread_id

                result = await loop.run_in_executor(
                    None,
                    lambda: service.users()
                    .messages()
                    .send(userId="me", body=send_body)
                    .execute(),
                )

                logger.info(
                    "gmail_sent",
                    to=to,
                    message_id=result["id"],
                    thread_id=thread_id,
                    ticket_id=ticket_id,
                )

                return SendResult(
                    success=True,
                    gmail_message_id=result["id"],
                    sent_at=datetime.now(timezone.utc),
                )

            except HttpError as exc:
                if exc.resp.status == 429 and attempt < MAX_RETRIES - 1:
                    wait = RETRY_DELAY * (attempt + 1)
                    logger.warning("gmail_send_rate_limited", attempt=attempt + 1, wait=wait)
                    await asyncio.sleep(wait)
                    continue

                logger.error("gmail_send_http_error", to=to, status=exc.resp.status, error=str(exc))
                return SendResult(success=False, error=f"Gmail API error {exc.resp.status}: {str(exc)}")

            except Exception as exc:
                logger.error("gmail_send_error", to=to, error=str(exc))
                return SendResult(success=False, error=str(exc))

        return SendResult(success=False, error="Max retries exhausted")

    # ── Mark As Read ─────────────────────────────────────────

    async def mark_as_read(self, message_id: str) -> bool:
        """Remove the UNREAD label from a message."""
        service = await self._get_service()
        loop = asyncio.get_running_loop()

        try:
            await loop.run_in_executor(
                None,
                lambda: service.users()
                .messages()
                .modify(
                    userId="me",
                    id=message_id,
                    body={"removeLabelIds": ["UNREAD"]},
                )
                .execute(),
            )
            logger.info("gmail_marked_read", message_id=message_id)
            return True
        except Exception as exc:
            logger.error("gmail_mark_read_error", message_id=message_id, error=str(exc))
            return False

    # ── Email Body Parsing ───────────────────────────────────

    @staticmethod
    def parse_email_body(payload: dict) -> tuple[str, str]:
        """
        Recursively extract plain text and HTML from a Gmail payload.

        Returns (body_plain, body_html).
        """
        body_plain = ""
        body_html = ""

        if "parts" in payload:
            for part in payload["parts"]:
                mime = part.get("mimeType", "")
                data = part.get("body", {}).get("data", "")

                if mime == "text/plain" and data:
                    body_plain = body_plain or GmailService._decode_b64(data)
                elif mime == "text/html" and data:
                    body_html = body_html or GmailService._decode_b64(data)
                elif "parts" in part:
                    nested_plain, nested_html = GmailService.parse_email_body(part)
                    body_plain = body_plain or nested_plain
                    body_html = body_html or nested_html
        else:
            data = payload.get("body", {}).get("data", "")
            mime = payload.get("mimeType", "")
            if data:
                decoded = GmailService._decode_b64(data)
                if mime == "text/plain":
                    body_plain = decoded
                elif mime == "text/html":
                    body_html = decoded

        # If only HTML, convert to plain text
        if not body_plain and body_html:
            body_plain = GmailService._html_to_text(body_html)

        return body_plain.strip(), body_html.strip()

    # ── Sender Parsing ───────────────────────────────────────

    @staticmethod
    def extract_sender_info(headers: dict[str, str]) -> SenderInfo:
        """
        Parse the 'from' header into name and email.

        Handles formats:
          - "John Doe <john@example.com>"
          - "<john@example.com>"
          - "john@example.com"
        """
        from_header = headers.get("from", "")

        # Pattern: "Name <email>"
        match = re.match(
            r'^"?([^"<]*)"?\s*<([^>]+)>$', from_header.strip()
        )
        if match:
            name = match.group(1).strip().strip('"')
            email = match.group(2).strip()
            return SenderInfo(name=name or email.split("@")[0], email=email)

        # Pattern: bare email
        email_match = re.search(r'[\w.+-]+@[\w-]+\.[\w.]+', from_header)
        if email_match:
            email = email_match.group(0)
            name = from_header.replace(email, "").strip(" <>\"'")
            return SenderInfo(name=name or email.split("@")[0], email=email)

        return SenderInfo(name="Unknown", email=from_header)

    # ── Body Cleaning ────────────────────────────────────────

    @staticmethod
    def _clean_email_body(text: str) -> str:
        """
        Clean an email body by removing:
        - Quoted reply chains (lines starting with >)
        - Common email footers / signatures
        - Excessive whitespace
        """
        lines = text.split("\n")
        cleaned: list[str] = []
        hit_signature = False

        # Common signature / footer markers
        signature_markers = [
            "-- ",             # Standard sig delimiter
            "---",
            "Sent from my ",
            "Get Outlook for",
            "________________________________",
            "This email and any attachments",
            "CONFIDENTIALITY NOTICE",
            "Disclaimer:",
            "Unsubscribe",
        ]

        # Quote prefixes
        quote_started = False

        for line in lines:
            stripped = line.strip()

            # Stop at signature markers
            if any(stripped.startswith(m) for m in signature_markers):
                hit_signature = True
                break

            # Skip quoted reply chains
            if stripped.startswith(">"):
                quote_started = True
                continue

            # Skip "On <date> <person> wrote:" headers
            if re.match(
                r"^On .+ wrote:\s*$", stripped, re.IGNORECASE
            ):
                quote_started = True
                continue

            # If we were in a quote block and hit a non-quote line,
            # stop processing (rest is likely old thread)
            if quote_started and stripped:
                break

            cleaned.append(line)

        result = "\n".join(cleaned).strip()

        # Collapse excessive blank lines
        result = re.sub(r"\n{3,}", "\n\n", result)

        return result

    # ── Private Helpers ──────────────────────────────────────

    @staticmethod
    def _decode_b64(data: str) -> str:
        """Decode URL-safe base64."""
        try:
            padded = data + "=" * (4 - len(data) % 4)
            return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
        except Exception:
            return ""

    @staticmethod
    def _html_to_text(html: str) -> str:
        """Convert HTML to clean plain text via BeautifulSoup."""
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "head", "meta", "link"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
        lines = (line.strip() for line in text.splitlines())
        return "\n".join(line for line in lines if line)


# ── Singleton ────────────────────────────────────────────────
gmail_service = GmailService()
