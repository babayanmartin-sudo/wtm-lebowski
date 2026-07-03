from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth ----
class AuthStatus(BaseModel):
    setup_required: bool
    authenticated: bool


class PasswordIn(BaseModel):
    password: str = Field(min_length=4)


# ---- accounts ----
class AccountIn(BaseModel):
    name: str
    type: str = "bank"
    currency: str = "AED"
    initial_balance: float = 0.0
    color: str = "#6366f1"
    icon: str = "wallet"
    archived: bool = False
    sort_order: int = 0


class AccountOut(ORMModel, AccountIn):
    id: int
    balance: float = 0.0
    balance_base: float = 0.0


# ---- categories ----
class CategoryIn(BaseModel):
    name: str
    parent_id: int | None = None
    kind: str = "expense"
    color: str = "#22d3ee"
    icon: str = "tag"
    archived: bool = False
    sort_order: int = 0


class CategoryOut(ORMModel, CategoryIn):
    id: int


# ---- transactions ----
class SplitIn(BaseModel):
    category_id: int | None = None
    amount: float
    note: str = ""


class SplitOut(ORMModel, SplitIn):
    id: int
    amount_base: float


class TransactionIn(BaseModel):
    date: date
    kind: str  # expense|income|transfer
    account_id: int
    amount: float = Field(gt=0)
    transfer_account_id: int | None = None
    transfer_amount: float | None = None
    payee: str = ""
    note: str = ""
    splits: list[SplitIn] = []


class TransactionOut(ORMModel):
    id: int
    date: date
    kind: str
    account_id: int
    amount: float
    currency: str
    amount_base: float
    transfer_account_id: int | None
    transfer_amount: float | None
    payee: str
    note: str
    template_id: int | None
    import_id: int | None
    splits: list[SplitOut]


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int


# ---- templates ----
class TemplateIn(BaseModel):
    name: str
    kind: str
    account_id: int
    amount: float = Field(gt=0)
    transfer_account_id: int | None = None
    transfer_amount: float | None = None
    category_id: int | None = None
    payee: str = ""
    note: str = ""
    frequency: str = "monthly"
    interval: int = Field(default=1, ge=1)
    next_due: date
    auto_post: bool = False
    active: bool = True


class TemplateOut(ORMModel, TemplateIn):
    id: int


# ---- budgets ----
class BudgetIn(BaseModel):
    category_id: int
    amount: float = Field(gt=0)


class BudgetOut(ORMModel, BudgetIn):
    id: int


class BudgetStatus(BaseModel):
    budget_id: int
    category_id: int
    amount: float
    spent: float
    month: str


# ---- goals ----
class ContributionIn(BaseModel):
    date: date
    amount: float
    note: str = ""


class ContributionOut(ORMModel, ContributionIn):
    id: int


class GoalIn(BaseModel):
    name: str
    target_amount: float = Field(gt=0)
    target_date: date | None = None
    color: str = "#a78bfa"
    icon: str = "target"
    archived: bool = False


class GoalOut(ORMModel, GoalIn):
    id: int
    saved: float = 0.0
    contributions: list[ContributionOut] = []


# ---- mapping rules ----
class RuleIn(BaseModel):
    pattern: str
    match_kind: str = "exact"  # exact|contains
    category_id: int
    priority: int = 0


class RuleOut(ORMModel, RuleIn):
    id: int
    hit_count: int
    last_used: datetime | None


# ---- ignore rules ----
class IgnoreRuleIn(BaseModel):
    pattern: str
    match_kind: str = "contains"  # exact|contains
    priority: int = 0


class IgnoreRuleOut(ORMModel, IgnoreRuleIn):
    id: int
    hit_count: int
    last_used: datetime | None


# ---- rates ----
class RateOut(ORMModel):
    date: date
    currency: str
    rate_to_base: float


# ---- imports ----
class ImportRowOut(ORMModel):
    id: int
    row_index: int
    raw: list
    parsed_date: date | None
    parsed_amount: float | None
    parsed_payee: str
    parsed_note: str
    suggested_category_id: int | None
    suggestion_confidence: str
    category_id: int | None
    is_duplicate: bool
    ignored: bool
    skip: bool
    error: str


class ImportOut(ORMModel):
    id: int
    filename: str
    account_id: int
    status: str
    headers: list
    mapping: dict
    options: dict


class ImportDetail(ImportOut):
    rows: list[ImportRowOut]


class MappingIn(BaseModel):
    mapping: dict  # field -> column index, e.g. {"date": 0, "amount": 3, ...}
    options: dict = {}
    preset_name: str = ""


class RowPatch(BaseModel):
    category_id: int | None = None
    skip: bool | None = None
