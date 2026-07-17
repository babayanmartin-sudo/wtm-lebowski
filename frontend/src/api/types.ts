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
  excluded_from_reports: boolean;
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

export interface BudgetAlert {
  category_id: number;
  category_name: string;
  spent: number;
  amount: number;
  ratio: number;
}

export interface TransactionSaveResult extends Transaction {
  budget_alerts: BudgetAlert[];
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  sum_base: number;
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

export interface OverallBudgetStatus {
  cap: number | null;
  spent: number;
  month: string;
}

export interface Settings {
  budget_threshold: number;
  overall_monthly_cap: number | null;
  mashreq_imap_host: string;
  mashreq_imap_port: string;
  mashreq_imap_user: string;
  mashreq_imap_password: string;
  mashreq_imap_folder: string;
  mashreq_card_accounts: Record<string, number>;
  amazon_default_account_id: number | null;
  mashreq_sync_enabled: boolean;
  amazon_sync_enabled: boolean;
  auto_sync_enabled: boolean;
  auto_sync_frequency_minutes: number;
  llm_provider: string;
  llm_api_key: string;
  llm_model: string;
  insights_memory: string;
}

export interface InsightsMessage {
  role: "user" | "assistant";
  content: string;
}

export interface InsightsAskResult {
  reply: string;
  conversation_id: number;
}

export interface InsightsConversationSummary {
  id: number;
  title: string;
  updated_at: string;
}

export interface InsightsConversationDetail extends InsightsConversationSummary {
  messages: InsightsMessage[];
  created_at: string;
}

export interface MashreqSyncImportSummary {
  id: number;
  account_id: number;
  count: number;
}

export interface MashreqSyncResult {
  imports: MashreqSyncImportSummary[];
  unmapped_count: number;
  unparsed_count: number;
}

export interface MashreqTestResult {
  ok: boolean;
  message: string;
}

export interface SyncAllResult {
  mashreq: MashreqSyncResult | null;
  amazon: AmazonSyncResult | null;
  errors: string[];
}

export interface AmazonSyncResult {
  imported_count: number;
  unparsed_count: number;
  import_id: number | null;
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
  by_category_income: CategoryTotal[];
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

export interface ReportFilters {
  date_from: string;
  date_to: string;
  account_id?: number | null;
  include_category_ids?: number[];
  exclude_category_ids?: number[];
}

export interface ReportPreview {
  base_currency: string;
  date_from: string;
  date_to: string;
  total: number;
  income: number;
  expense: number;
  count: number;
  average: number;
  by_category: CategoryTotal[];
  by_category_income: CategoryTotal[];
  series: SeriesBucket[];
  series_granularity: "day" | "week" | "month";
  recent: Transaction[];
}

export interface SavedReport {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface SavedReportDetail extends SavedReport {
  filters: ReportFilters;
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
  previous_rate_to_base: number | null;
}
