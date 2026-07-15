"""Parse Amazon "Ordered: ..." confirmation emails and fetch them over IMAP
from the same dedicated forwarding mailbox used for Mashreq alerts.

Amazon ships at least two different plain-text templates for this
notification:
- "digest" style: `* item name\n  Quantity: N\n  price AED`, price always
  has a clean decimal.
- "single big item" style: item name / product-link lines, then a blank
  line, `Quantity: N`, then a separate `AED<digits>` line where the cents
  come from a superscript run in the original HTML and collapse into the
  integer with NO decimal point in plain text (e.g. `AED10020` for
  AED100.20) — unusable on its own. That template does reliably print a
  correct `Total AED<amount>` per order, though, which is used as a
  fallback for single-item orders.

One email can bundle several orders; order boundaries only matter here to
resolve the single-item Total fallback — otherwise every line item
anywhere in the body becomes its own row."""

import re
from dataclasses import dataclass
from datetime import date

from . import email_utils

SUBJECT = "Ordered:"
SUBJECT_REFUND = "Refund on order"

_ORDER_SPLIT_RE = re.compile(r"Order #")
_QUANTITY_RE = re.compile(r"Quantity:\s*(?P<qty>\d+)")
_PRICE_BEFORE_AED_RE = re.compile(r"([\d,]+\.\d+)\s*AED")
_PRICE_AFTER_AED_RE = re.compile(r"AED\s*([\d,]+\.\d+)")
_TOTAL_RE = re.compile(r"Total\s*AED\s*([\d,]+\.\d+)")

_REFUND_TOTAL_RE = re.compile(r"Total Refund:\s*AED\s*([\d,]+\.\d+)")
_REFUND_ITEM_RE = re.compile(r"Item:\s*(?P<name>.+?)\n\s*Quantity:\s*(?P<qty>\d+)", re.DOTALL)


@dataclass
class ParsedItem:
    name: str
    quantity: int
    price: float
    date: date
    is_refund: bool = False


def _item_name_before(chunk: str, pos: int) -> str:
    """Nearest non-blank, non-URL line before `pos` — works for both
    templates: the digest template's `* item name` line, and the
    single-item template's (truncated) product title line that sits right
    above its product-link URL."""
    lines = chunk[:pos].splitlines()
    for line in reversed(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("<http") or stripped.startswith("[image:"):
            continue
        return stripped.lstrip("*").strip()
    return ""


def _price_near(chunk: str, pos: int) -> float | None:
    window = chunk[pos : pos + 300]
    m = _PRICE_BEFORE_AED_RE.search(window)
    if m:
        return float(m.group(1).replace(",", ""))
    m = _PRICE_AFTER_AED_RE.search(window)
    if m:
        return float(m.group(1).replace(",", ""))
    return None


def parse_order_items(subject: str, body: str, received: date) -> list[ParsedItem]:
    if SUBJECT not in subject:
        return []

    items: list[ParsedItem] = []
    order_chunks = _ORDER_SPLIT_RE.split(body)[1:] or [body]

    for chunk in order_chunks:
        anchors = list(_QUANTITY_RE.finditer(chunk))
        if not anchors:
            continue

        parsed: list[tuple[str, int, float | None]] = []
        for m in anchors:
            name = _item_name_before(chunk, m.start())
            price = _price_near(chunk, m.end())
            parsed.append((name, int(m.group("qty")), price))

        if len(parsed) == 1 and parsed[0][2] is None:
            total_match = _TOTAL_RE.search(chunk)
            if total_match:
                name, qty, _ = parsed[0]
                parsed[0] = (name, qty, float(total_match.group(1).replace(",", "")))

        for name, qty, price in parsed:
            if price is None or not name:
                continue
            items.append(ParsedItem(name=" ".join(name.split()), quantity=qty, price=price, date=received))

    return items


def parse_refund_items(subject: str, body: str, received: date) -> list[ParsedItem]:
    """"Refund on order ..." emails — a different subject/template
    entirely. Amazon states a single `Total Refund: AED...` per email (even
    when it covers more than one item's breakdown), so this always returns
    at most one row, using the first `Item:` line for the payee."""
    if SUBJECT_REFUND not in subject:
        return []
    total_match = _REFUND_TOTAL_RE.search(body)
    if not total_match:
        return []
    amount = float(total_match.group(1).replace(",", ""))
    item_match = _REFUND_ITEM_RE.search(body)
    name = " ".join(item_match.group("name").split()) if item_match else "Amazon refund"
    qty = int(item_match.group("qty")) if item_match else 1
    return [ParsedItem(name=name, quantity=qty, price=amount, date=received, is_refund=True)]


def fetch_unseen_orders(host: str, port: str, user: str, password: str, folder: str) -> list[tuple[str, str, date]]:
    """(subject, plaintext body, message date) for unseen Amazon order emails."""
    return email_utils.fetch_unseen_by_subject(host, port, user, password, folder, SUBJECT)


def fetch_unseen_refunds(host: str, port: str, user: str, password: str, folder: str) -> list[tuple[str, str, date]]:
    """(subject, plaintext body, message date) for unseen Amazon refund emails."""
    return email_utils.fetch_unseen_by_subject(host, port, user, password, folder, SUBJECT_REFUND)
