---
paths:
  - "backend/tests/**/*"
---

# Testing

- Tests in `backend/tests/`; pytest fixtures in conftest.py
- `client` fixture creates fresh DB per test, sets up auth password
- `seeded` fixture adds AED + USD accounts, common categories (grocery, food, entertainment, income, housing)
- Each test creates its own records; no shared state
- Imports: use TestClient to POST /api/imports, then /api/imports/{id}/mapping, verify rows, commit
- Mock rates don't auto-fetch; tests set them explicitly or use default 1.0
