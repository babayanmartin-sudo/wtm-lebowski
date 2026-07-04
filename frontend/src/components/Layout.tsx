import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BookOpen,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  Repeat,
  Target,
  Tags,
  Upload,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { api } from "../api/client";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/templates", label: "Recurring/Planned", icon: Repeat },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/rules", label: "Rules", icon: BookOpen },
];

export default function Layout({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  async function logout() {
    await api.post("/api/auth/logout");
    qc.invalidateQueries({ queryKey: ["auth"] });
  }

  return (
    <div className="flex h-full">
      <aside className="glass m-3 flex w-56 shrink-0 flex-col rounded-2xl p-3">
        <div className="mb-6 flex items-center gap-2 px-2 pt-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 text-sm font-bold text-white">
            ET
          </div>
          <span className="text-base font-semibold tracking-tight">ExpenseTracker</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-indigo-500/20 text-indigo-200"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-100"
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="btn-ghost mt-4 w-full text-gray-400">
          <LogOut size={15} /> Lock
        </button>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
