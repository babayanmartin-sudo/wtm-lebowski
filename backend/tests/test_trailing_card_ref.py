import io

from app.services.importer import strip_trailing_card_ref


def test_strip_trailing_card_ref_removes_pattern():
    assert strip_trailing_card_ref("STARBUCKS COFFEE 784 1561490302") == "STARBUCKS COFFEE"


def test_strip_trailing_card_ref_tolerates_extra_whitespace():
    assert strip_trailing_card_ref("STARBUCKS COFFEE   784   1561490302  ") == "STARBUCKS COFFEE"


def test_strip_trailing_card_ref_leaves_short_trailing_numbers_alone():
    # "42" is not the 3-digit+10-digit pattern -> must not be touched
    assert strip_trailing_card_ref("CARREFOUR MALL BR 42") == "CARREFOUR MALL BR 42"


def test_strip_trailing_card_ref_only_matches_at_end():
    text = "784 1561490302 STARBUCKS COFFEE"
    assert strip_trailing_card_ref(text) == text


def test_strip_trailing_card_ref_wrong_digit_counts_untouched():
    # 3 digits + 9 digits (not 10) -> not the pattern, left alone
    assert strip_trailing_card_ref("SHOP 784 156149030") == "SHOP 784 156149030"


def test_strip_trailing_card_ref_no_match_returns_unchanged():
    assert strip_trailing_card_ref("PLAIN MERCHANT NAME") == "PLAIN MERCHANT NAME"


def test_import_row_payee_cleaned_end_to_end(seeded):
    c = seeded["client"]
    csv = "Date,Description,Amount\n01/07/2026,STARBUCKS COFFEE 784 1561490302,-25.00\n"
    imp = c.post(
        "/api/imports",
        files={"file": ("card.csv", io.BytesIO(csv.encode()), "text/csv")},
        data={"account_id": str(seeded["aed"]["id"])},
    ).json()
    imp = c.post(
        f"/api/imports/{imp['id']}/mapping",
        json={"mapping": {"date": 0, "payee": 1, "amount": 2}, "options": {}},
    ).json()
    assert imp["rows"][0]["parsed_payee"] == "STARBUCKS COFFEE"

    c.post(f"/api/imports/{imp['id']}/commit")
    tx = c.get("/api/transactions").json()["items"][0]
    assert tx["payee"] == "STARBUCKS COFFEE"
