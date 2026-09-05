def _template(seeded, **kw):
    body = {
        "name": "Gym",
        "kind": "expense",
        "account_id": seeded["aed"]["id"],
        "amount": 100,
        "category_id": seeded["food"]["id"],
        "frequency": "monthly",
        "interval": 1,
        "next_due": "2026-06-01",
        "end_date": None,
        "auto_post": False,
        "active": True,
    }
    body.update(kw)
    return body


def test_template_without_end_date_unaffected(seeded):
    c = seeded["client"]
    t = c.post("/api/templates", json=_template(seeded)).json()
    assert t["active"] is True
    assert t["end_date"] is None


def test_end_date_in_past_deactivates_on_create(seeded):
    c = seeded["client"]
    t = c.post("/api/templates", json=_template(seeded, end_date="2026-05-01")).json()
    assert t["active"] is False


def test_materialize_stops_at_end_date(seeded):
    """Monthly template due 2026-06-01, end 2026-06-15: only June posts,
    July onward never materializes, and it deactivates. Creating an
    auto_post template that's already due posts immediately, so nothing
    is left for a subsequent explicit /materialize call."""
    c = seeded["client"]
    t = c.post(
        "/api/templates",
        json=_template(seeded, end_date="2026-06-15", auto_post=True),
    ).json()
    assert t["active"] is False

    posted = c.post("/api/templates/materialize").json()["posted"]
    assert posted == 0
    txs = c.get("/api/transactions").json()
    assert txs["total"] == 1
    assert txs["items"][0]["date"] == "2026-06-01"


def test_pending_excludes_expired_template(seeded):
    c = seeded["client"]
    c.post("/api/templates", json=_template(seeded, end_date="2026-05-01", auto_post=False))
    assert c.get("/api/templates/pending").json() == []


def test_post_now_deactivates_when_reaching_end_date(seeded):
    c = seeded["client"]
    t = c.post(
        "/api/templates",
        json=_template(seeded, next_due="2026-06-01", end_date="2026-06-01", auto_post=False),
    ).json()
    assert len(c.get("/api/templates/pending").json()) == 1

    posted = c.post(f"/api/templates/{t['id']}/post").json()
    assert posted["active"] is False
    assert c.get("/api/transactions").json()["total"] == 1


def test_skip_deactivates_when_reaching_end_date(seeded):
    c = seeded["client"]
    t = c.post(
        "/api/templates",
        json=_template(seeded, next_due="2026-06-01", end_date="2026-06-01", auto_post=False),
    ).json()
    skipped = c.post(f"/api/templates/{t['id']}/skip").json()
    assert skipped["active"] is False
    assert c.get("/api/transactions").json()["total"] == 0


def test_create_with_auto_post_and_past_due_posts_immediately(seeded):
    """Regression: auto_post=True on a template that's already due must
    post right away, not wait for the next app restart (materialize_due()
    otherwise only ever runs at startup). A monthly template due
    2026-06-01 catches up every missed month up to today, not just one."""
    c = seeded["client"]
    t = c.post(
        "/api/templates",
        json=_template(seeded, next_due="2026-06-01", auto_post=True),
    ).json()
    assert c.get("/api/transactions").json()["total"] > 0
    assert t["next_due"] != "2026-06-01"  # advanced past the just-posted occurrence(s)


def test_toggling_auto_post_on_via_update_posts_immediately(seeded):
    c = seeded["client"]
    t = c.post(
        "/api/templates",
        json=_template(seeded, next_due="2026-06-01", auto_post=False),
    ).json()
    assert c.get("/api/transactions").json()["total"] == 0

    body = _template(seeded, next_due="2026-06-01", auto_post=True)
    updated = c.put(f"/api/templates/{t['id']}", json=body).json()
    assert c.get("/api/transactions").json()["total"] > 0
    assert updated["next_due"] != "2026-06-01"


def test_edit_adding_past_end_date_deactivates(seeded):
    c = seeded["client"]
    t = c.post("/api/templates", json=_template(seeded, next_due="2026-07-01")).json()
    assert t["active"] is True
    body = _template(seeded, next_due="2026-07-01", end_date="2026-06-01")
    updated = c.put(f"/api/templates/{t['id']}", json=body).json()
    assert updated["active"] is False
