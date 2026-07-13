import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  Repeat,
  Target,
  Tags,
  Upload,
  UserRound,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";

import { api } from "../api/client";
import { useVersion } from "../api/hooks";
import logo from "../assets/lebowski.png";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/goals", label: "Goals & Loans", icon: Target },
  { to: "/templates", label: "Planned", icon: Repeat },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/rules", label: "Rules", icon: BookOpen },
  { to: "/profile", label: "Profile", icon: UserRound },
];

const COLLAPSE_KEY = "et_sidebar_collapsed";

export default function Layout({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const { data: version } = useVersion();

  async function logout() {
    await api.post("/api/auth/logout");
    qc.invalidateQueries({ queryKey: ["auth"] });
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSE_KEY, prev ? "0" : "1");
      return !prev;
    });
  }

  return (
    <div className="flex h-full">
      <aside
        className={`glass m-3 flex shrink-0 flex-col rounded-2xl p-3 transition-[width] duration-200 ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        <div className={`mb-6 flex items-center pt-2 ${collapsed ? "justify-center" : "gap-2 px-2"}`}>
          <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          {!collapsed && (
            <span className="text-xs leading-tight font-semibold tracking-tight">
              Where's the Money,
              <br />
              Lebowski
            </span>
          )}
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  collapsed ? "justify-center" : ""
                } ${
                  isActive
                    ? "bg-lime-500/15 text-lime-300"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-100"
                }`
              }
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          className={`btn-ghost mb-1 w-full text-gray-400 ${collapsed ? "px-0" : ""}`}
        >
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          {!collapsed && "Collapse"}
        </button>
        <button onClick={logout} className={`btn-ghost w-full text-gray-400 ${collapsed ? "px-0" : ""}`}>
          <LogOut size={15} />
          {!collapsed && "Lock"}
        </button>
        {!collapsed && version?.version && (
          <p className="mt-1 px-2 text-center text-[10px] text-gray-600">{version.version}</p>
        )}
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
