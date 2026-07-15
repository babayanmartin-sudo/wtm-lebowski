"""Parse Mashreq Bank "Transaction Confirmation on Mashreq Card" alert
emails and fetch them over IMAP from a dedicated forwarding mailbox.

Only the purchase-confirmation format is handled — other alert types
(refunds, declines, ATM withdrawals) are skipped."""

import re
from dataclasses import dataclass
from datetime import datetime

from . import email_utils
from .email_utils import test_imap_connection as test_connection  # noqa: F401  (re-exported)

SUBJECT = "Transaction Confirmation on Mashreq Card"

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
    """(subject, plaintext body) for unseen Mashreq alert emails."""
    triples = email_utils.fetch_unseen_by_subject(host, port, user, password, folder, SUBJECT)
    return [(subject, body) for subject, body, _ in triples]
