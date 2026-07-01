import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type {
  Account,
  AuthStatus,
  Budget,
  BudgetStatus,
  Category,
  DashboardSummary,
  Goal,
  ImportDetail,
  Rule,
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

export function useGoals() {
  return useQuery({ queryKey: ["goals"], queryFn: () => api.get<Goal[]>("/api/goals") });
}

export function useRules(q: string) {
  return useQuery({
    queryKey: ["rules", q],
    queryFn: () => api.get<Rule[]>(`/api/rules${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
}

export function useImport(id: number | null) {
  return useQuery({
    queryKey: ["import", id],
    queryFn: () => api.get<ImportDetail>(`/api/imports/${id}`),
    enabled: id !== null,
  });
}

export function useDashboard(month?: string) {
  const qs = month ? `?month=${month}` : "";
  return useQuery({
    queryKey: ["dashboard", month ?? "now"],
    queryFn: () => api.get<DashboardSummary>(`/api/dashboard/summary${qs}`),
  });
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

export const MONEY_KEYS = [["accounts"], ["transactions"], ["dashboard"], ["budgets"], ["templates"]];
