import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useAuthStatus } from "./api/hooks";
import Layout from "./components/Layout";
import Toaster from "./components/Toaster";
import { useIsMobile } from "./hooks/useIsMobile";
import MobileAccounts from "./mobile/MobileAccounts";
import MobileDashboard from "./mobile/MobileDashboard";
import MobileShell from "./mobile/MobileShell";
import MobileTransactions from "./mobile/MobileTransactions";
import AccountsPage from "./pages/Accounts";
import BudgetsPage from "./pages/Budgets";
import CategoriesPage from "./pages/Categories";
import DashboardPage from "./pages/Dashboard";
import GoalsPage from "./pages/Goals";
import ImportPage from "./pages/Import";
import LoginPage from "./pages/Login";
import ProfilePage from "./pages/Profile";
import ReportsPage from "./pages/Reports";
import RulesPage from "./pages/Rules";
import TemplatesPage from "./pages/Templates";
import TransactionsPage from "./pages/Transactions";

export default function App() {
  const { data: auth, isLoading } = useAuthStatus();
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  useEffect(() => {
    const onUnauthorized = () => qc.invalidateQueries({ queryKey: ["auth"] });
    window.addEventListener("et:unauthorized", onUnauthorized);
    return () => window.removeEventListener("et:unauthorized", onUnauthorized);
  }, [qc]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">Loading…</div>
    );
  }

  if (!auth || auth.setup_required || !auth.authenticated) {
    return <LoginPage setupRequired={auth?.setup_required ?? false} />;
  }

  if (isMobile) {
    return (
      <>
        <MobileShell>
          <Routes>
            <Route path="/" element={<MobileDashboard />} />
            <Route path="/transactions" element={<MobileTransactions />} />
            <Route path="/accounts" element={<MobileAccounts />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MobileShell>
        <Toaster />
      </>
    );
  }

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toaster />
    </>
  );
}
