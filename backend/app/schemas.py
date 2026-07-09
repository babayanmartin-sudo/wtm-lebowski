from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth ----
class AuthStatus(BaseModel):
    setup_required: bool
    authenticated: bool


class PasswordIn(BaseModel):
    password: str = Field(min_length=4)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=4)


# ---- accounts ----
class AccountIn(BaseModel):
    name: str
    type: str = "bank"
    currency: str = "AED"
    initial_balance: float | str = 0.0
    color: str = "#6366f1"
    icon: str = "wallet"
    archived: bool = False
    sort_order: int = 0
    is_main: bool = False
    exclude_from_net_worth: bool = False

    @field_validator("initial_balance", mode="before")
    @classmethod
    def parse_initial_balance(cls, v):
        """Parse number: digits and period only (e.g. 1234.56)."""
        if isinstance(v, str):
            v = v.strip()
            if not v:
                raise ValueError("Only digits and period (.) are allowed. Example: 1234.56")
            # Allow only digits and one period
            if not all(c.isdigit() or c == "." for c in v):
                raise ValueError("Only digits and period (.) are allowed. Example: 1234.56")
            if v.count(".") > 1:
                raise ValueError("Only one decimal point allowed. Example: 1234.56")
            try:
                return float(v)
            except ValueError:
                raise ValueError("Invalid number format. Example: 1234.56")
        return v


class AccountOut(ORMModel, AccountIn):
    id: int
    balance: float = 0.0
    balance_base: float = 0.0


class ReconcileIn(BaseModel):
    actual_balance: float
    on_date: date | None = None


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
    loan_id: int | None = None
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
    loan_id: int | None
    splits: list[SplitOut]


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int


class BulkTransactionIn(BaseModel):
    ids: list[int] = Field(min_length=1)
    action: str  # set_category | set_account | set_kind | delete
    category_id: int | None = None  # for set_category; null = uncategorized
    account_id: int | None = None  # for set_account
    kind: str | None = None  # for set_kind: expense | income


class BulkTransactionResult(BaseModel):
    updated: int


class ReconcileResult(BaseModel):
    account: AccountOut
    adjustment: TransactionOut | None = None  # null when balances already matched


# ---- templates ----
class TemplateIn(BaseModel):
    name: str
    kind: str
    account_id: int
    amount: float = Field(gt=0)
    transfer_account_id: int | None = None
    transfer_amount: float | None = None
    category_id: int | None = None
    loan_id: int | None = None
    payee: str = ""
    note: str = ""
    frequency: str = "monthly"
    interval: int = Field(default=1, ge=1)
    next_due: date
    end_date: date | None = None
    auto_post: bool = False
    active: bool = True


class TemplateOut(ORMModel, TemplateIn):
    id: int


# ---- budgets ----
class BudgetIn(BaseModel):
    category_id: int
    amount: float = Field(gt=0)
    period: str = "monthly"  # monthly|yearly


class BudgetOut(ORMModel, BudgetIn):
    id: int


class BudgetStatus(BaseModel):
    budget_id: int
    category_id: int
    amount: float
    period: str
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


# ---- loans ----
class LoanIn(BaseModel):
    name: str
    direction: str  # debt (I owe) | receivable (owed to me)
    principal_amount: float = Field(gt=0)
    currency: str = "AED"
    color: str = "#f97316"
    icon: str = "landmark"
    archived: bool = False


class LoanOut(ORMModel, LoanIn):
    id: int
    paid: float = 0.0
    remaining: float = 0.0


# ---- mapping rules ----
class RuleIn(BaseModel):
    pattern: str
    match_kind: str = "exact"  # exact|contains
    category_id: int
    alias: str = ""  # replaces the transaction payee when this rule matches
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
    previous_rate_to_base: float | None = None


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
    kind: str | None


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
    is_duplicate: bool | None = None
    kind: str | None = None
