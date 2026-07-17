"""Tool functions exposed to the LLM in the Chat Q&A widget (#43). Each is a
thin wrapper around existing aggregation code — no query logic is
duplicated here, only reshaped into a form suitable for a tool-call result.

Every function takes `db` first and only JSON-serializable kwargs after, so
each can be registered directly against both the Anthropic and OpenAI tool
schemas without any provider-specific plumbing."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import BASE_CURRENCY
from ..models import Account, Category
from ..routers.budgets import compute_budget_status
from ..routers.dashboard import _by_category, _category_ids_with_children, _period, _totals
from ..routers.transactions import list_transactions
from ..services.balances import balance_in_base, compute_balances
from ..services.settings import INSIGHTS_MEMORY_KEY, INSIGHTS_MEMORY_MAX_CHARS, get_str_setting, set_str_setting


def get_summary(
    db: Session,
    date_from: str | None = None,
    date_to: str | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
) -> dict:
    """Total income/expense for a period, optionally scoped to one account/category."""
    start, end = _period(date_from, date_to)
    cat_ids = _category_ids_with_children(db, category_id)
    totals = _totals(db, start, end, account_id, cat_ids)
    return {
        "base_currency": BASE_CURRENCY,
        "date_from": start.isoformat(),
        "date_to": end.isoformat(),
        "income": round(totals.get("income") or 0.0, 2),
        "expense": round(totals.get("expense") or 0.0, 2),
    }


def get_category_breakdown(
    db: Session,
    date_from: str | None = None,
    date_to: str | None = None,
    kind: str = "expense",
    account_id: int | None = None,
    category_id: int | None = None,
) -> dict:
    """Spend/income broken down by category for a period. Without
    category_id, subcategories are rolled up into their parent (same as
    the Dashboard's default view) — pass a parent's category_id to break
    it back out into its subcategories."""
    start, end = _period(date_from, date_to)
    breakdown = _by_category(db, start, end, account_id, category_id, kind=kind)
    return {"date_from": start.isoformat(), "date_to": end.isoformat(), "kind": kind, "categories": breakdown}


def search_transactions(
    db: Session,
    date_from: str | None = None,
    date_to: str | None = None,
    category_id: int | None = None,
    kind: str | None = None,
    q: str | None = None,
    amount_op: str | None = None,
    amount_value: float | None = None,
    limit: int = 20,
) -> dict:
    """Search individual transactions — use for detail questions ('what did
    I buy at X', 'show me transactions over 500 last month'). Capped low
    since results feed an LLM prompt, not a UI table."""
    page = list_transactions(
        db=db,
        account_id=None,
        category_id=category_id,
        uncategorized=False,
        loan_id=None,
        kind=kind,
        date_from=date_from,
        date_to=date_to,
        q=q,
        amount_op=amount_op,
        amount_value=amount_value,
        limit=min(limit, 20),
        offset=0,
    )
    return {
        "total_matching": page.total,
        "sum_base": page.sum_base,
        "transactions": [
            {
                "date": t.date.isoformat(),
                "kind": t.kind,
                "payee": t.payee,
                "note": t.note,
                "amount_base": t.amount_base,
                "currency": t.currency,
            }
            for t in page.items
        ],
    }


def get_budget_status(db: Session, month: str | None = None) -> dict:
    """Budget vs actual spend for a month (YYYY-MM), defaults to current month."""
    m = month or date.today().strftime("%Y-%m")
    statuses = compute_budget_status(db, m)
    categories = {c.id: c for c in db.scalars(select(Category))}
    return {
        "month": m,
        "budgets": [
            {
                "category": categories[s.category_id].name if s.category_id in categories else "?",
                "period": s.period,
                "limit": s.amount,
                "spent": s.spent,
            }
            for s in statuses
        ],
    }


def remember(db: Session, note: str) -> dict:
    """Save a short durable fact about the user's preferences for future
    conversations. Only call when the user explicitly states something
    worth remembering long-term (e.g. 'my main account is X', 'always
    exclude transfers from spending totals') — not for routine Q&A."""
    note = note.strip()
    if not note:
        return {"ok": False, "error": "empty note"}
    existing = get_str_setting(db, INSIGHTS_MEMORY_KEY, "") or ""
    lines = [line for line in existing.splitlines() if line.strip()]
    lines.append(f"- {note}")
    combined = "\n".join(lines)
    while len(combined) > INSIGHTS_MEMORY_MAX_CHARS and len(lines) > 1:
        lines.pop(0)
        combined = "\n".join(lines)
    set_str_setting(db, INSIGHTS_MEMORY_KEY, combined[-INSIGHTS_MEMORY_MAX_CHARS:])
    db.commit()
    return {"ok": True, "saved": note}


def get_accounts_balances(db: Session) -> dict:
    """Current balance of every non-archived account, in base currency."""
    balances = compute_balances(db)
    accounts = db.scalars(select(Account).where(Account.archived.is_(False))).all()
    return {
        "base_currency": BASE_CURRENCY,
        "accounts": [
            {
                "name": a.name,
                "currency": a.currency,
                "balance": round(balances.get(a.id, a.initial_balance), 2),
                "balance_base": balance_in_base(db, a, balances.get(a.id, a.initial_balance)),
            }
            for a in accounts
        ],
    }


TOOL_SCHEMAS = [
    {
        "name": "get_summary",
        "description": "Total income and expense for a date range, optionally scoped to one account or category.",
        "parameters": {
            "type": "object",
            "properties": {
                "date_from": {"type": "string", "description": "YYYY-MM-DD, defaults to start of current month"},
                "date_to": {"type": "string", "description": "YYYY-MM-DD, defaults to end of current month"},
                "account_id": {"type": "integer"},
                "category_id": {"type": "integer"},
            },
        },
    },
    {
        "name": "get_category_breakdown",
        "description": (
            "Spend or income broken down by category for a date range. Without category_id, "
            "subcategories are rolled up into their parent category. To see subcategories, first "
            "call this without category_id to find the parent, then call again with that parent's "
            "category_id to break it out into its subcategories."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "date_from": {"type": "string"},
                "date_to": {"type": "string"},
                "kind": {"type": "string", "enum": ["expense", "income"]},
                "account_id": {"type": "integer"},
                "category_id": {
                    "type": "integer",
                    "description": "Parent category id — returns its subcategory breakdown instead of the top-level rollup",
                },
            },
        },
    },
    {
        "name": "search_transactions",
        "description": "Search individual transactions by date range, category, kind, text, or amount. Use for detail questions, not totals.",
        "parameters": {
            "type": "object",
            "properties": {
                "date_from": {"type": "string"},
                "date_to": {"type": "string"},
                "category_id": {"type": "integer"},
                "kind": {"type": "string", "enum": ["expense", "income", "transfer"]},
                "q": {"type": "string", "description": "text search over payee/note"},
                "amount_op": {"type": "string", "enum": ["eq", "gt", "lt"]},
                "amount_value": {"type": "number"},
                "limit": {"type": "integer", "description": "max 20"},
            },
        },
    },
    {
        "name": "get_budget_status",
        "description": "Budget limit vs actual spend per category for a given month (YYYY-MM), defaults to current month.",
        "parameters": {
            "type": "object",
            "properties": {"month": {"type": "string"}},
        },
    },
    {
        "name": "get_accounts_balances",
        "description": "Current balance of every account in base currency.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "remember",
        "description": (
            "Save a short durable fact about the user's preferences for future conversations. "
            "Only call this when the user explicitly states something worth remembering long-term "
            "(e.g. 'my main account is X', 'always exclude transfers') — never for routine Q&A."
        ),
        "parameters": {
            "type": "object",
            "properties": {"note": {"type": "string"}},
            "required": ["note"],
        },
    },
]

TOOLS = {
    "get_summary": get_summary,
    "get_category_breakdown": get_category_breakdown,
    "search_transactions": search_transactions,
    "get_budget_status": get_budget_status,
    "get_accounts_balances": get_accounts_balances,
    "remember": remember,
}
