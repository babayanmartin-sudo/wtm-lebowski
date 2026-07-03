import io

from app.services.importer import strip_trailing_card_ref


def test_strip_trailing_card_ref_removes_pattern():
    assert strip_trailing_card_ref("STARBUCKS COFFEE 784 1561490302") == "STARBUCKS COFFEE"


def test_strip_trailing_card_ref_tolerates_extra_whitespace():
    assert strip_trailing_card_ref("STARBUCKS COFFEE   784   1561490302  ") == "STARBUCKS COFFEE"


def test_strip_trailing_card_ref_strips_any_trailing_number():
    # generalized: single short trailing number is also stripped now
    assert strip_trailing_card_ref("CARREFOUR MALL BR 42") == "CARREFOUR MALL BR"


def test_strip_trailing_card_ref_strips_multiple_trailing_groups():
    assert strip_trailing_card_ref("SHOP 784 156149030") == "SHOP"


def test_strip_trailing_card_ref_only_matches_at_end():
    text = "784 1561490302 STARBUCKS COFFEE"
    assert strip_trailing_card_ref(text) == text


def test_strip_trailing_card_ref_no_match_returns_unchanged():
    assert strip_trailing_card_ref("PLAIN MERCHANT NAME") == "PLAIN MERCHANT NAME"


def test_strip_trailing_card_ref_leaves_glued_digits_alone():
    # digits glued to a word (no preceding whitespace) are not a reference tail
    assert strip_trailing_card_ref("7-ELEVEN") == "7-ELEVEN"
    assert strip_trailing_card_ref("SHOP OPEN 24/7") == "SHOP OPEN 24/7"


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
