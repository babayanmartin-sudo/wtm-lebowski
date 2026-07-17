import {
  ArrowLeftRight,
  BookOpen,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  PiggyBank,
  Repeat,
  ScrollText,
  Tags,
  Target,
  Upload,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { useVersion } from "../api/hooks";

const MENU_ITEMS = [
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/goals", label: "Goals & Loans", icon: Target },
  { to: "/templates", label: "Planned", icon: Repeat },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/rules", label: "Rules", icon: BookOpen },
  { to: "/reports", label: "Reports", icon: ScrollText },
  { to: "/profile", label: "Profile", icon: UserRound },
];

export default function MobileShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: version } = useVersion();

  async function logout() {
    await api.post("/api/auth/logout");
    qc.invalidateQueries({ queryKey: ["auth"] });
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)] text-white">
      <main className="min-h-0 flex-1 overflow-y-auto pt-6 pb-24 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <div key={location.pathname} className="m-page-transition">
          {children}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-[var(--color-line)] bg-[var(--color-panel)] pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
        <TabButton
          icon={LayoutDashboard}
          label="Home"
          active={location.pathname === "/"}
          onClick={() => navigate("/")}
        />
        <TabButton
          icon={ArrowLeftRight}
          label="Activity"
          active={location.pathname === "/transactions"}
          onClick={() => navigate("/transactions")}
        />
        <TabButton
          icon={Wallet}
          label="Accounts"
          active={location.pathname === "/accounts"}
          onClick={() => navigate("/accounts")}
        />
        <TabButton icon={MenuIcon} label="Menu" active={menuOpen} onClick={() => setMenuOpen(true)} />
      </nav>

      {menuOpen && (
        <div
          className="m-sheet-backdrop fixed inset-0 z-30 flex items-end bg-black/60"
          onMouseDown={(e) => e.target === e.currentTarget && setMenuOpen(false)}
        >
          <div className="m-sheet max-h-[85vh] w-full overflow-y-auto rounded-t-xl border-t border-[var(--color-line)] bg-[var(--color-panel)] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Menu</h2>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-md p-1.5 text-gray-400 hover:bg-white/10"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 landscape:grid-cols-4">
              {MENU_ITEMS.map(({ to, label, icon: Icon }) => (
                <button
                  key={to}
                  onClick={() => {
                    navigate(to);
                    setMenuOpen(false);
                  }}
                  className="flex flex-col items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-4 text-center transition-colors active:bg-[#ffb545]/10"
                >
                  <Icon size={20} className="text-[#ffb545]" />
                  <span className="text-xs leading-tight text-gray-300">{label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={logout}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 py-3 text-sm text-gray-300 active:bg-white/10"
            >
              <LogOut size={15} /> Lock
            </button>
            {version?.version && (
              <p className="mt-3 text-center text-[10px] text-gray-600">{version.version}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-16 flex-col items-center gap-1 rounded-xl py-1.5 transition-colors ${
        active ? "text-[#ffb545]" : "text-gray-500"
      }`}
    >
      <Icon size={20} />
      <span className="text-[10px] leading-none">{label}</span>
    </button>
  );
}
