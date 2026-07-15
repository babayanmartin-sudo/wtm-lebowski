"""Parse Mashreq Bank "Transaction Confirmation on Mashreq Card" alert
emails and fetch them over IMAP from a dedicated forwarding mailbox.

Only the purchase-confirmation format is handled — other alert types
(refunds, declines, ATM withdrawals) are skipped."""

import email
import email.header
import email.message
import imaplib
import logging
import re
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

SUBJECT = "Transaction Confirmation on Mashreq Card"
# imaplib has no timeout by default — a stalled/slow mail server would
# otherwise hang the request (and the "Syncing…" button) indefinitely.
IMAP_TIMEOUT_SECONDS = 30

_ALERT_RE = re.compile(
    r"ending with (?P<suffix>\d{4}).*?"
    r"purchase of AED\s*(?P<amount>[\d,]+\.\d{2})\s*"
    r"at (?P<merchant>.+?)\s+on\s+"
    r"(?P<timestamp>\d{2}-[A-Z]{3}-\d{4}\s+\d{2}:\d{2}\s+[AP]M)",
    re.DOTALL,
)


@dataclass
class ParsedAlert:
    card_suffix: str
    amount: float
    merchant: str
    date: datetime


def parse_alert(subject: str, body: str) -> ParsedAlert | None:
    if SUBJECT not in subject:
        return None
    m = _ALERT_RE.search(body)
    if not m:
        return None
    try:
        amount = float(m.group("amount").replace(",", ""))
        dt = datetime.strptime(m.group("timestamp"), "%d-%b-%Y %I:%M %p")
    except ValueError:
        return None
    return ParsedAlert(
        card_suffix=m.group("suffix"),
        amount=amount,
        merchant=m.group("merchant").strip(),
        date=dt,
    )


def fetch_unseen_alerts(host: str, port: str, user: str, password: str, folder: str) -> list[tuple[str, str]]:
    """Connect over IMAPS, return (subject, plaintext body) for unseen
    matching messages, marking every matched-subject message \\Seen once
    fetched (parseable or not) so a body we can't parse doesn't get
    refetched forever."""
    results: list[tuple[str, str]] = []
    conn = imaplib.IMAP4_SSL(host, int(port), timeout=IMAP_TIMEOUT_SECONDS)
    try:
        conn.login(user, password)
        conn.select(folder)
        status, data = conn.search(None, "UNSEEN", f'SUBJECT "{SUBJECT}"')
        if status != "OK":
            logger.warning("Mashreq IMAP search failed: %s", data)
            return results
        for num in data[0].split():
            status, msg_data = conn.fetch(num, "(RFC822)")
            if status != "OK" or not msg_data or not isinstance(msg_data[0], tuple):
                continue
            msg = email.message_from_bytes(msg_data[0][1])
            subject = _decode_header(msg.get("Subject", ""))
            body = _extract_body(msg)
            results.append((subject, body))
            conn.store(num, "+FLAGS", "\\Seen")
    finally:
        try:
            conn.logout()
        except Exception:
            pass
    return results


def test_connection(host: str, port: str, user: str, password: str, folder: str) -> tuple[bool, str]:
    """Login + select the folder, nothing else — used by the Profile page's
    'Test connection' button so a typo in host/creds/folder surfaces
    immediately instead of at the next Sync click."""
    try:
        conn = imaplib.IMAP4_SSL(host, int(port), timeout=IMAP_TIMEOUT_SECONDS)
    except (OSError, ValueError) as e:
        return False, f"Couldn't connect: {e}"
    try:
        conn.login(user, password)
    except imaplib.IMAP4.error as e:
        return False, f"Login failed: {e}"
    try:
        status, _ = conn.select(folder)
        if status != "OK":
            return False, f"Folder '{folder}' not found"
    finally:
        try:
            conn.logout()
        except Exception:
            pass
    return True, "Connected"


def _decode_header(raw: str) -> str:
    parts = email.header.decode_header(raw)
    return "".join(
        (p.decode(enc or "utf-8", errors="replace") if isinstance(p, bytes) else p) for p, enc in parts
    )


def _extract_body(msg: email.message.Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                charset = part.get_content_charset() or "utf-8"
                return part.get_payload(decode=True).decode(charset, errors="replace")
        return ""
    charset = msg.get_content_charset() or "utf-8"
    payload = msg.get_payload(decode=True)
    return payload.decode(charset, errors="replace") if payload else ""
