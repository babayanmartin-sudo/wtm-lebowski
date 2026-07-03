export interface AuthStatus {
  setup_required: boolean;
  authenticated: boolean;
}

export interface Account {
  id: number;
  name: string;
  type: string;
  currency: string;
  initial_balance: number;
  color: string;
  icon: string;
  archived: boolean;
  sort_order: number;
  balance: number;
  balance_base: number;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  kind: "expense" | "income";
  color: string;
  icon: string;
  archived: boolean;
  sort_order: number;
}

export interface Split {
  id?: number;
  category_id: number | null;
  amount: number;
  amount_base?: number;
  note: string;
}

export interface Transaction {
  id: number;
  date: string;
  kind: "expense" | "income" | "transfer";
  account_id: number;
  amount: number;
  currency: string;
  amount_base: number;
  transfer_account_id: number | null;
  transfer_amount: number | null;
  payee: string;
  note: string;
  template_id: number | null;
  import_id: number | null;
  splits: Split[];
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
}

export interface Template {
  id: number;
  name: string;
  kind: "expense" | "income" | "transfer";
  account_id: number;
  amount: number;
  transfer_account_id: number | null;
  transfer_amount: number | null;
  category_id: number | null;
  payee: string;
  note: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  next_due: string;
  auto_post: boolean;
  active: boolean;
}

export interface Budget {
  id: number;
  category_id: number;
  amount: number;
}

export interface BudgetStatus {
  budget_id: number;
  category_id: number;
  amount: number;
  spent: number;
  month: string;
}

export interface Contribution {
  id: number;
  date: string;
  amount: number;
  note: string;
}

export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  target_date: string | null;
  color: string;
  icon: string;
  archived: boolean;
  saved: number;
  contributions: Contribution[];
}

export interface Rule {
  id: number;
  pattern: string;
  match_kind: "exact" | "contains";
  category_id: number;
  alias: string;
  priority: number;
  hit_count: number;
  last_used: string | null;
}

export interface ImportRow {
  id: number;
  row_index: number;
  raw: string[];
  parsed_date: string | null;
  parsed_amount: number | null;
  parsed_payee: string;
  parsed_note: string;
  suggested_category_id: number | null;
  suggestion_confidence: string;
  category_id: number | null;
  is_duplicate: boolean;
  ignored: boolean;
  skip: boolean;
  error: string;
}

export interface IgnoreRule {
  id: number;
  pattern: string;
  match_kind: "exact" | "contains";
  priority: number;
  hit_count: number;
  last_used: string | null;
}

export interface ImportDetail {
  id: number;
  filename: string;
  account_id: number;
  status: "mapping" | "preview" | "done" | "cancelled";
  headers: string[];
  mapping: Record<string, number>;
  options: Record<string, unknown>;
  rows: ImportRow[];
}

export interface CategoryTotal {
  category_id: number | null;
  name: string;
  color: string;
  amount: number;
}

export interface DashboardSummary {
  base_currency: string;
  month: string;
  net_worth: number;
  income: number;
  expense: number;
  by_category: CategoryTotal[];
  monthly: { month: string; income: number; expense: number }[];
  recent: Transaction[];
}
