import os
import tempfile

import pytest

os.environ["ET_DATA_DIR"] = tempfile.mkdtemp(prefix="et-test-")

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        c.post("/api/auth/setup", json={"password": "test1234"})
        yield c


@pytest.fixture()
def seeded(client):
    """Client with AED + USD accounts and a couple of categories."""
    aed = client.post(
        "/api/accounts", json={"name": "AED Bank", "currency": "AED", "initial_balance": 1000}
    ).json()
    usd = client.post(
        "/api/accounts", json={"name": "USD Card", "currency": "USD", "initial_balance": 100}
    ).json()
    food = client.post("/api/categories", json={"name": "Food", "kind": "expense"}).json()
    grocery = client.post(
        "/api/categories", json={"name": "Groceries", "kind": "expense", "parent_id": food["id"]}
    ).json()
    salary = client.post("/api/categories", json={"name": "Salary", "kind": "income"}).json()
    return {"client": client, "aed": aed, "usd": usd, "food": food, "grocery": grocery, "salary": salary}
