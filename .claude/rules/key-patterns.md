---
paths:
  - "backend/**/*.py"
---

# Key Files & Patterns

## Transaction Submission (backend/app/routers/transactions.py:_build)

```python
def _build(db, body: TransactionIn):
    # 1. Create Transaction record, validate currency
    # 2. For expense/income: build splits (validate categories), set loan_id if provided
    #    - loan must exist, direction must match kind
    # 3. For transfer: validate both accounts, set transfer_amount
    # 4. Compute amount_base via to_base()
    # 5. Return Transaction + splits for serialization
```

**Loan linking constraint:** expense → direction="debt", income → direction="receivable", transfer → no loan allowed.

## Dashboard Category Breakdown (backend/app/routers/dashboard.py:_by_category)

```python
if category_id:
    # Show selected category + its children
    children = [c.id for c in categories.values() if c.parent_id == category_id]
    wanted = ([category_id] + children) if children else [category_id]
else:
    # Roll children into their parents
    for cid, amount in amounts.items():
        top = categories[cid].parent_id if cid and categories[cid].parent_id else cid
        totals[top] += amount
```

**Result: with filter, both parent total + child breakdown; without filter, category hierarchy collapses one level.**

## Import Suggestion (backend/app/services/matcher.py:suggest)

```python
def suggest(db, payee, category_kind):
    norm = normalize(payee)  # fuzzy
    raw = payee.upper().strip()

    # 1. Exact rule match (highest priority)
    # 2. Contains rule match (lower priority)
    # 3. Fuzzy match against transaction payees (learn from history)
    # Return (category_id, confidence: "exact" | "rule" | "fuzzy" | "")
```

**Key: Fuzzy matching searches only against archived=false transactions to avoid old data noise.**

## Loan Balance Computation

```python
# backend/app/routers/loans.py:_out
paid = db.execute(
    select(func.sum(Transaction.amount_base))
    .where(
        Transaction.loan_id == loan.id,
        Transaction.kind == ("expense" if loan.direction == "debt" else "income")
    )
).scalar() or 0.0
remaining = loan.principal_amount - paid
```

**Always computed live; not stored. Mirrors `compute_budget_status` pattern in budgets.py.**
