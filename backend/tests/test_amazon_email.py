from datetime import date

from app.services.amazon_email import SUBJECT, SUBJECT_REFUND, parse_order_items, parse_refund_items

SUBJECT_LINE = 'Ordered: "SLEEPHEAD®Toddler Travel..." and 3 more items'

BODY = """
Thanks for your order!

Arriving today 8:00 PM – 11:59 PM

Daria - Dubai

Order #
403-6993172-6437116

View or edit order
https://www.amazon.ae/your-orders/order-details?orderID=403-6993172-6437116

* SLEEPHEAD®Toddler Travel Airplane Bed Kids Airplane Extender Sea, Travel Inflatable Foot Rest Portable Bed Grey
  Quantity: 1
  65.99 AED


Total
65.99 AED



Arriving today 3 PM – 8 PM



Daria - Dubai

Order #
403-9155742-5732320



View or edit order
https://www.amazon.ae/your-orders/order-details?orderID=403-9155742-5732320

* Curaprox Kids Toothpaste, Strawberry, 60ml, 950ppm Toothpaste with Fluoride, Cavity and Plaque Protection
  Quantity: 1
  35.7 AED

* Comfort Concentrate Fabric Softener, Baby, 1.5L, For Sensitive Skin
  Quantity: 1
  22.1 AED


Total
57.8 AED



Arriving 15 July



Daria - Dubai

Order #
403-8895935-5065912



View or edit order
https://www.amazon.ae/your-orders/order-details?orderID=403-8895935-5065912

* DENTEK DNTK FUN 90CT FLOSSER 36
  Quantity: 1
  19.62 AED


Total
19.62 AED
"""


def test_parse_order_items_happy_path():
    items = parse_order_items(SUBJECT_LINE, BODY, date(2026, 7, 7))
    assert len(items) == 4
    assert items[0].name.startswith("SLEEPHEAD")
    assert items[0].price == 65.99
    assert items[0].quantity == 1
    assert items[0].date == date(2026, 7, 7)
    assert items[1].name.startswith("Curaprox")
    assert items[1].price == 35.7
    assert items[2].name.startswith("Comfort")
    assert items[2].price == 22.1
    assert items[3].name == "DENTEK DNTK FUN 90CT FLOSSER 36"
    assert items[3].price == 19.62


def test_parse_order_items_wrong_subject_returns_empty():
    assert parse_order_items("Shipped: your order", BODY, date(2026, 7, 7)) == []


def test_parse_order_items_forwarded_subject_still_matches():
    items = parse_order_items(f"Fwd: {SUBJECT_LINE}", BODY, date(2026, 7, 7))
    assert len(items) == 4


def test_subject_constant_used_in_sample():
    assert SUBJECT in SUBJECT_LINE


# Amazon's "single big item" template: item price prints as broken
# concatenated digits with no decimal point (superscript cents collapsed
# in plain text), but the order's own Total is always well-formed — used
# as a fallback when there's exactly one item in the order.
SINGLE_ITEM_SUBJECT = 'Ordered: "Aptamil Comfort 3 Growing..."'
SINGLE_ITEM_BODY = """
Thanks for your order!

Arriving today by 11:59 PM

Daria - Dubai
Order # ‫403-1033834-1576342

View or edit order
<https://amazon.ae/your-orders/order-details?orderID=403-1033834-1576342>

[image: Aptamil Comfort 3 Growing up Formula Milk From 1-3 Years,
Specifically Designed for the Dietary Support of Constipation and Abdominal
Discomfort, 800g]
<https://amazon.ae/dp/B0F2MWST31?ref_=i_fed_asin_title>
Aptamil Comfort 3 Growing Form...
<https://amazon.ae/dp/B0F2MWST31?ref_=t_fed_asin_title>

Quantity: 1

AED10020



Total AED100.20


Keep shopping for
"""


def test_parse_single_item_template_falls_back_to_total():
    items = parse_order_items(SINGLE_ITEM_SUBJECT, SINGLE_ITEM_BODY, date(2026, 6, 22))
    assert len(items) == 1
    assert items[0].name == "Aptamil Comfort 3 Growing Form..."
    assert items[0].price == 100.20
    assert items[0].quantity == 1


REFUND_SUBJECT_LINE = "Refund on order 403-8966210-6057160"
REFUND_BODY = """
Hello,

Greetings from Amazon.ae.

We are writing to confirm that we have processed a refund of AED113.88 for
your Amazon.ae Order 403-8966210-6057160. This amount has been credited to
your original payment method and will appear in your account in 5-7
business days.
This refund is for the following item(s):

    Item: JC Toys - Lots to Love Babies 14" All Vinyl Doll | 4 Piece Bath
Time Gift Set | Posable & Waterproof | Ages 2+ Pink
    Quantity: 1
    ASIN: B07TT7LRR6
    Reason for refund: Item not satisfactory

    The following is the breakdown of your refund for this item:
        Item Refund: AED108.46
        Import Fee Deposit Refund: AED5.42

Total Refund: AED113.88
Your refund is being credited as follows:

Visa Credit Card [expiring on 11/2027]: AED113.88
"""


def test_parse_refund_items_happy_path():
    items = parse_refund_items(REFUND_SUBJECT_LINE, REFUND_BODY, date(2026, 2, 9))
    assert len(items) == 1
    item = items[0]
    assert item.is_refund is True
    assert item.price == 113.88
    assert item.quantity == 1
    assert item.name.startswith("JC Toys")
    assert "Bath Time Gift Set" in item.name


def test_parse_refund_items_wrong_subject_returns_empty():
    assert parse_refund_items("Ordered: something", REFUND_BODY, date(2026, 2, 9)) == []
    # "Refund" emails must never be picked up by the order parser either
    assert parse_order_items(REFUND_SUBJECT_LINE, REFUND_BODY, date(2026, 2, 9)) == []


def test_parse_refund_items_forwarded_subject_still_matches():
    items = parse_refund_items(f"Fwd: {REFUND_SUBJECT_LINE}", REFUND_BODY, date(2026, 2, 9))
    assert len(items) == 1


def test_refund_subject_constant_used_in_sample():
    assert SUBJECT_REFUND in REFUND_SUBJECT_LINE
