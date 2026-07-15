import email
from datetime import date

from app.services.email_utils import original_message_date


def _msg(date_header: str) -> email.message.Message:
    msg = email.message.Message()
    msg["Date"] = date_header
    return msg


def test_uses_outer_header_when_body_has_no_forwarded_date():
    msg = _msg("Tue, 7 Jul 2026 07:54:51 +0000")
    assert original_message_date(msg, "just a plain body, no forward") == date(2026, 7, 7)


def test_prefers_embedded_forwarded_date_over_outer_header():
    # outer header is the forward time (today); body's own "Date:" line is
    # the original send time — the one that should win
    msg = _msg("Wed, 15 Jul 2026 16:56:25 +0400")
    body = (
        "---------- Forwarded message ---------\n"
        "От: Amazon.ae <auto-confirm@amazon.ae>\n"
        "Date: Tue, 7 Jul 2026 07:54:51 +0000\n"
        "Subject: Ordered: ...\n"
    )
    assert original_message_date(msg, body) == date(2026, 7, 7)


def test_parses_russian_locale_gmail_forward_date():
    msg = _msg("Wed, 15 Jul 2026 16:56:25 +0400")
    body = (
        "---------- Forwarded message ---------\n"
        "От: Amazon.ae <auto-confirm@amazon.ae>\n"
        "Date: пн, 22 июн. 2026 г. в 21:13\n"
        "Subject: Ordered: ...\n"
    )
    assert original_message_date(msg, body) == date(2026, 6, 22)


def test_falls_back_to_today_when_nothing_parseable(monkeypatch):
    import datetime as dt

    class FixedDatetime(dt.datetime):
        @classmethod
        def now(cls, tz=None):
            return dt.datetime(2026, 7, 16)

    monkeypatch.setattr("app.services.email_utils.datetime", FixedDatetime)
    msg = email.message.Message()  # no Date header at all
    assert original_message_date(msg, "no date anywhere in here") == date(2026, 7, 16)
