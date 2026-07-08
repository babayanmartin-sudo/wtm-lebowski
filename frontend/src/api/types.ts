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
  is_main: boolean;
  exclude_from_net_worth: boolean;
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
  loan_id: number | null;
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
  loan_id: number | null;
  payee: string;
  note: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  next_due: string;
  end_date: string | null;
  auto_post: boolean;
  active: boolean;
}

export type BudgetPeriod = "monthly" | "yearly";

export interface Budget {
  id: number;
  category_id: number;
  amount: number;
  period: BudgetPeriod;
}

export interface BudgetStatus {
  budget_id: number;
  category_id: number;
  amount: number;
  period: BudgetPeriod;
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

export interface Loan {
  id: number;
  name: string;
  direction: "debt" | "receivable";
  principal_amount: number;
  currency: string;
  color: string;
  icon: string;
  archived: boolean;
  paid: number;
  remaining: number;
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
  kind: string | null;
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

export interface SeriesBucket {
  label: string; // ISO date: bucket start (day, Monday-of-week, or 1st-of-month)
  income: number;
  expense: number;
}

export interface DashboardSummary {
  base_currency: string;
  date_from: string;
  date_to: string;
  account_id: number | null;
  category_id: number | null;
  net_worth: number;
  income: number;
  expense: number;
  by_category: CategoryTotal[];
  series: SeriesBucket[];
  series_granularity: "day" | "week" | "month";
  recent: Transaction[];
}

export interface DashboardParams {
  date_from: string;
  date_to: string;
  account_id?: number;
  category_id?: number;
}

export interface Projection {
  base_currency: string;
  current_net_worth: number;
  points: { month: string; net_worth: number }[];
}

export interface ExchangeRate {
  date: string;
  currency: string;
  rate_to_base: number;
}
