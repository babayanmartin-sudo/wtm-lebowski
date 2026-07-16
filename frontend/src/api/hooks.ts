import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type {
  Account,
  AmazonSyncResult,
  AuthStatus,
  Budget,
  BudgetStatus,
  Category,
  DashboardParams,
  DashboardSummary,
  ExchangeRate,
  Goal,
  IgnoreRule,
  ImportDetail,
  InsightsAskResult,
  InsightsMessage,
  Loan,
  MashreqSyncResult,
  MashreqTestResult,
  OverallBudgetStatus,
  Projection,
  ReportFilters,
  ReportPreview,
  Rule,
  SavedReport,
  SavedReportDetail,
  Settings,
  Template,
  TransactionPage,
} from "./types";

export function useAuthStatus() {
  return useQuery({ queryKey: ["auth"], queryFn: () => api.get<AuthStatus>("/api/auth/status") });
}

export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/api/accounts") });
}

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/api/categories") });
}

export function useCategoryUsage() {
  return useQuery({
    queryKey: ["categories", "usage"],
    queryFn: () => api.get<Record<number, number>>("/api/categories/usage"),
  });
}

export function useTransactions(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }
  return useQuery({
    queryKey: ["transactions", qs.toString()],
    queryFn: () => api.get<TransactionPage>(`/api/transactions?${qs}`),
  });
}

export function useTemplates() {
  return useQuery({ queryKey: ["templates"], queryFn: () => api.get<Template[]>("/api/templates") });
}

export function usePendingTemplates() {
  return useQuery({
    queryKey: ["templates", "pending"],
    queryFn: () => api.get<Template[]>("/api/templates/pending"),
  });
}

export function useBudgets() {
  return useQuery({ queryKey: ["budgets"], queryFn: () => api.get<Budget[]>("/api/budgets") });
}

export function useBudgetStatus(month?: string) {
  const qs = month ? `?month=${month}` : "";
  return useQuery({
    queryKey: ["budgets", "status", month ?? "now"],
    queryFn: () => api.get<BudgetStatus[]>(`/api/budgets/status${qs}`),
  });
}

export function useOverallBudgetStatus(month?: string) {
  const qs = month ? `?month=${month}` : "";
  return useQuery({
    queryKey: ["budgets", "overall-status", month ?? "now"],
    queryFn: () => api.get<OverallBudgetStatus>(`/api/budgets/overall-status${qs}`),
  });
}

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/api/settings") });
}

export function useUpdateSettings() {
  return useInvalidating(
    (d: Partial<Settings>) => api.put<Settings>("/api/settings", d),
    [["settings"], ["budgets"]],
  );
}

export function useMashreqSync() {
  return useInvalidating(() => api.post<MashreqSyncResult>("/api/imports/mashreq-sync"), []);
}

export function useMashreqTest() {
  return useInvalidating(
    (d: Partial<Settings>) => api.post<MashreqTestResult>("/api/imports/mashreq-test", d),
    [],
  );
}

export function useAmazonSync() {
  return useInvalidating(() => api.post<AmazonSyncResult>("/api/imports/amazon-sync"), []);
}

export function useInsightsAsk() {
  return useInvalidating(
    (d: { message: string; history: InsightsMessage[] }) =>
      api.post<InsightsAskResult>("/api/insights/ask", d),
    [],
  );
}

export function useGoals() {
  return useQuery({ queryKey: ["goals"], queryFn: () => api.get<Goal[]>("/api/goals") });
}

export function useLoans() {
  return useQuery({ queryKey: ["loans"], queryFn: () => api.get<Loan[]>("/api/loans") });
}

export function useRates() {
  return useQuery({ queryKey: ["rates"], queryFn: () => api.get<ExchangeRate[]>("/api/rates") });
}

export function useBaseCurrency() {
  return useQuery({
    queryKey: ["rates", "base"],
    queryFn: () => api.get<{ base: string }>("/api/rates/base"),
    staleTime: Infinity,
  });
}

export function useVersion() {
  return useQuery({
    queryKey: ["version"],
    queryFn: () => api.get<{ version: string }>("/api/version"),
    staleTime: Infinity,
  });
}

export function useRules(q: string) {
  return useQuery({
    queryKey: ["rules", q],
    queryFn: () => api.get<Rule[]>(`/api/rules${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
}

export function useIgnoreRules(q: string) {
  return useQuery({
    queryKey: ["ignore-rules", q],
    queryFn: () =>
      api.get<IgnoreRule[]>(`/api/ignore-rules${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
}

export function useImport(id: number | null) {
  return useQuery({
    queryKey: ["import", id],
    queryFn: () => api.get<ImportDetail>(`/api/imports/${id}`),
    enabled: id !== null,
  });
}

export function useProjection(months: number) {
  return useQuery({
    queryKey: ["projection", months],
    queryFn: () => api.get<Projection>(`/api/dashboard/projection?months=${months}`),
  });
}

export function useDashboard(params: DashboardParams) {
  const qs = new URLSearchParams();
  qs.set("date_from", params.date_from);
  qs.set("date_to", params.date_to);
  if (params.account_id) qs.set("account_id", String(params.account_id));
  if (params.category_id) qs.set("category_id", String(params.category_id));
  return useQuery({
    queryKey: ["dashboard", qs.toString()],
    queryFn: () => api.get<DashboardSummary>(`/api/dashboard/summary?${qs}`),
  });
}

export function useReportPreview(filters: ReportFilters) {
  return useQuery({
    queryKey: ["report-preview", filters],
    queryFn: () => api.post<ReportPreview>("/api/reports/preview", filters),
  });
}

export function useSavedReports() {
  return useQuery({ queryKey: ["reports"], queryFn: () => api.get<SavedReport[]>("/api/reports") });
}

export function useSavedReport(id: number | null) {
  return useQuery({
    queryKey: ["reports", id],
    queryFn: () => api.get<SavedReportDetail>(`/api/reports/${id}`),
    enabled: id !== null,
  });
}

export function useSaveReport() {
  return useInvalidating(
    (d: { name: string; description: string; filters: ReportFilters }) => api.post("/api/reports", d),
    [["reports"]],
  );
}

export function useDeleteReport() {
  return useInvalidating((id: number) => api.del(`/api/reports/${id}`), [["reports"]]);
}

/** Mutation that invalidates the given query key prefixes on success. */
export function useInvalidating<TArgs, TResult = unknown>(
  fn: (args: TArgs) => Promise<TResult>,
  keys: string[][],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of keys) qc.invalidateQueries({ queryKey: key });
    },
  });
}

export const MONEY_KEYS = [
  ["accounts"],
  ["transactions"],
  ["dashboard"],
  ["budgets"],
  ["templates"],
  ["projection"],
  ["loans"],
];
