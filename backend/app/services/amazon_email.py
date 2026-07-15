"""Parse Amazon "Ordered: ..." confirmation emails and fetch them over IMAP
from the same dedicated forwarding mailbox used for Mashreq alerts.

One email can bundle several orders; order boundaries are ignored — every
line item anywhere in the body becomes its own row. Only the order-
confirmation format is handled (not shipped/delivered notifications, which
carry a different subject and never reach the mailbox filter)."""

import re
from dataclasses import dataclass
from datetime import date

from . import email_utils

SUBJECT = "Ordered:"

_ITEM_RE = re.compile(
    r"\*\s*(?P<name>.+?)\n\s*Quantity:\s*(?P<qty>\d+)\n\s*(?P<price>[\d,]+\.\d+)\s*AED",
    re.DOTALL,
)


@dataclass
class ParsedItem:
    name: str
    quantity: int
    price: float
    date: date


def parse_order_items(subject: str, body: str, received: date) -> list[ParsedItem]:
    if SUBJECT not in subject:
        return []
    items = []
    for m in _ITEM_RE.finditer(body):
        try:
            price = float(m.group("price").replace(",", ""))
        except ValueError:
            continue
        items.append(
            ParsedItem(
                name=" ".join(m.group("name").split()),
                quantity=int(m.group("qty")),
                price=price,
                date=received,
            )
        )
    return items


def fetch_unseen_orders(host: str, port: str, user: str, password: str, folder: str) -> list[tuple[str, str, date]]:
    """(subject, plaintext body, message date) for unseen Amazon order emails."""
    return email_utils.fetch_unseen_by_subject(host, port, user, password, folder, SUBJECT)
