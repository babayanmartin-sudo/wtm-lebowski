"""Shared IMAP/MIME plumbing for the email-based sync sources (Mashreq
alerts, Amazon order confirmations) — both read from the same dedicated
forwarding mailbox, just filtered by a different subject substring."""

import email
import email.header
import email.message
import email.utils
import imaplib
import logging
from datetime import date, datetime

logger = logging.getLogger(__name__)

# imaplib has no timeout by default — a stalled/slow mail server would
# otherwise hang the request (and the "Syncing…" button) indefinitely.
IMAP_TIMEOUT_SECONDS = 30


def decode_header(raw: str) -> str:
    parts = email.header.decode_header(raw)
    return "".join(
        (p.decode(enc or "utf-8", errors="replace") if isinstance(p, bytes) else p) for p, enc in parts
    )


def extract_body(msg: email.message.Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                charset = part.get_content_charset() or "utf-8"
                return part.get_payload(decode=True).decode(charset, errors="replace")
        return ""
    charset = msg.get_content_charset() or "utf-8"
    payload = msg.get_payload(decode=True)
    return payload.decode(charset, errors="replace") if payload else ""


def _message_date(msg: email.message.Message) -> date:
    raw = msg.get("Date")
    if raw:
        parsed = email.utils.parsedate_to_datetime(raw)
        if parsed:
            return parsed.date()
    return datetime.now().date()


def fetch_unseen_by_subject(
    host: str, port: str, user: str, password: str, folder: str, subject_substr: str
) -> list[tuple[str, str, date]]:
    """Connect over IMAPS, return (subject, plaintext body, message date) for
    unseen messages whose subject contains `subject_substr`, marking every
    matched message \\Seen once fetched (parseable or not) so a body we
    can't parse doesn't get refetched forever."""
    results: list[tuple[str, str, date]] = []
    conn = imaplib.IMAP4_SSL(host, int(port), timeout=IMAP_TIMEOUT_SECONDS)
    try:
        conn.login(user, password)
        conn.select(folder)
        status, data = conn.search(None, "UNSEEN", f'SUBJECT "{subject_substr}"')
        if status != "OK":
            logger.warning("IMAP search failed for %r: %s", subject_substr, data)
            return results
        for num in data[0].split():
            status, msg_data = conn.fetch(num, "(RFC822)")
            if status != "OK" or not msg_data or not isinstance(msg_data[0], tuple):
                continue
            msg = email.message_from_bytes(msg_data[0][1])
            subject = decode_header(msg.get("Subject", ""))
            body = extract_body(msg)
            results.append((subject, body, _message_date(msg)))
            conn.store(num, "+FLAGS", "\\Seen")
    finally:
        try:
            conn.logout()
        except Exception:
            pass
    return results


def test_imap_connection(host: str, port: str, user: str, password: str, folder: str) -> tuple[bool, str]:
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
