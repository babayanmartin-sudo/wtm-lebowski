from datetime import datetime

from app.services.mashreq_email import SUBJECT, parse_alert

BODY = """Dear Customer,

Thank you for banking with Mashreq Bank.

Please note the details of a recent transaction on your Mashreq Card.

Your Mashreq Cashback Card ending with 7694 was used for a purchase of AED 220.00 at EGGSPECTATION RESTAURAN DUBAI AE on 11-JUL-2026 01:22 PM. Available limit is AED  13,471.75"""


def test_parse_alert_happy_path():
    r = parse_alert(SUBJECT, BODY)
    assert r is not None
    assert r.card_suffix == "7694"
    assert r.amount == 220.0
    assert r.merchant == "EGGSPECTATION RESTAURAN DUBAI AE"
    assert r.date == datetime(2026, 7, 11, 13, 22)


def test_parse_alert_wrong_subject_returns_none():
    assert parse_alert("Some other email", BODY) is None


def test_parse_alert_malformed_body_returns_none():
    assert parse_alert(SUBJECT, "not a real alert body") is None


def test_parse_alert_matches_forwarded_subject():
    r = parse_alert(f"Fwd: {SUBJECT}", BODY)
    assert r is not None
    assert r.card_suffix == "7694"


def test_parse_alert_thousands_separator_in_amount():
    body = BODY.replace("AED 220.00", "AED 1,234.56")
    r = parse_alert(SUBJECT, body)
    assert r is not None
    assert r.amount == 1234.56
