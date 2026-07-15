from datetime import date

from app.services.amazon_email import SUBJECT, parse_order_items

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
