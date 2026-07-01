from datetime import date

import pytest

from app.services.importer import (
    _find_header_row,
    guess_mapping,
    header_signature,
    parse_amount,
    parse_date_cell,
    parse_file,
)


class TestParseAmount:
    def test_plain(self):
        assert parse_amount("123.45") == 123.45

    def test_thousands_dot_decimal(self):
        assert parse_amount("1,234.56") == 1234.56

    def test_thousands_comma_decimal(self):
        assert parse_amount("1.234,56") == 1234.56

    def test_decimal_comma_only(self):
        assert parse_amount("1234,56") == 1234.56

    def test_comma_thousands_only(self):
        assert parse_amount("1,234") == 1234.0

    def test_negative(self):
        assert parse_amount("-45.00") == -45.0

    def test_parenthesis_negative(self):
        assert parse_amount("(12.50)") == -12.5

    def test_currency_junk(self):
        assert parse_amount("AED 1,500.00") == 1500.0

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            parse_amount("")

    def test_text_raises(self):
        with pytest.raises(ValueError):
            parse_amount("TOTAL")


class TestParseDate:
    def test_dayfirst(self):
        assert parse_date_cell("05/03/2026", dayfirst=True) == date(2026, 3, 5)

    def test_monthfirst(self):
        assert parse_date_cell("05/03/2026", dayfirst=False) == date(2026, 5, 3)

    def test_iso(self):
        assert parse_date_cell("2026-03-05") == date(2026, 3, 5)


class TestHeaderDetection:
    def test_junk_preamble_skipped(self):
        rows = [
            ["Statement for account 12345", "", ""],
            ["Period: 01/01/2026 - 31/01/2026", "", ""],
            ["Date", "Description", "Amount"],
            ["05/01/2026", "CARREFOUR", "-120.50"],
        ]
        assert _find_header_row(rows) == 2

    def test_clean_file_header_first(self):
        rows = [
            ["Date", "Description", "Amount"],
            ["05/01/2026", "CARREFOUR", "-120.50"],
        ]
        assert _find_header_row(rows) == 0


class TestGuessMapping:
    def test_common_english(self):
        m = guess_mapping(["Date", "Description", "Amount"])
        assert m == {"date": 0, "payee": 1, "amount": 2}

    def test_debit_credit_wins_over_amount(self):
        m = guess_mapping(["Date", "Details", "Debit", "Credit"])
        assert "amount" not in m
        assert m["debit"] == 2 and m["credit"] == 3


class TestParseFile:
    def test_csv_semicolon(self):
        content = "Date;Description;Amount\n05/01/2026;CARREFOUR;-120,50\n".encode()
        rows, header = parse_file("statement.csv", content)
        assert header == 0
        assert rows[1] == ["05/01/2026", "CARREFOUR", "-120,50"]

    def test_signature_stable(self):
        a = header_signature(["Date", "Amount"])
        b = header_signature(["date ", " amount"])
        assert a == b
