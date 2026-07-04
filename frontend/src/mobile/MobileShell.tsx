import {
  ArrowLeftRight,
  BookOpen,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  PiggyBank,
  Plus,
  Repeat,
  Tags,
  Target,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { api } from "../api/client";
import { useAccounts, useCategories } from "../api/hooks";
import TransactionModal from "../components/TransactionModal";

const MENU_ITEMS = [
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/templates", label: "Recurring/Planned", icon: Repeat },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/rules", label: "Rules", icon: BookOpen },
];

export default function MobileShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await api.post("/api/auth/logout");
    qc.invalidateQueries({ queryKey: ["auth"] });
  }

  return (
    <div className="flex h-full flex-col bg-[#0a0b08] text-white">
      <main className="min-h-0 flex-1 overflow-y-auto pb-28">
        <div key={location.pathname} className="m-page-transition">
          {children}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-end justify-around border-t border-white/5 bg-[#111309]/95 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] backdrop-blur-lg">
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
        <button
          onClick={() => setAdding(true)}
          className="-mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#c6f135] text-black shadow-lg shadow-[#c6f135]/30 transition-transform active:scale-90"
        >
          <Plus size={26} />
        </button>
        <TabButton
          icon={Wallet}
          label="Accounts"
          active={location.pathname === "/accounts"}
          onClick={() => navigate("/accounts")}
        />
        <TabButton icon={MenuIcon} label="Menu" active={menuOpen} onClick={() => setMenuOpen(true)} />
      </nav>

      {adding && (
        <TransactionModal accounts={accounts} categories={categories} existing={null} onClose={() => setAdding(false)} />
      )}

      {menuOpen && (
        <div
          className="m-sheet-backdrop fixed inset-0 z-30 flex items-end bg-black/60"
          onMouseDown={(e) => e.target === e.currentTarget && setMenuOpen(false)}
        >
          <div className="m-sheet w-full rounded-t-3xl border-t border-white/10 bg-[#111309] p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Menu</h2>
              <button
                onClick={() => setMenuOpen(false)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {MENU_ITEMS.map(({ to, label, icon: Icon }) => (
                <button
                  key={to}
                  onClick={() => {
                    navigate(to);
                    setMenuOpen(false);
                  }}
                  className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 px-2 py-4 text-center transition-colors active:bg-[#c6f135]/10"
                >
                  <Icon size={20} className="text-[#c6f135]" />
                  <span className="text-xs leading-tight text-gray-300">{label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={logout}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/5 py-3 text-sm text-gray-300 active:bg-white/10"
            >
              <LogOut size={15} /> Lock
            </button>
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
      className={`flex w-14 flex-col items-center gap-1 rounded-xl py-1.5 transition-colors ${
        active ? "text-[#c6f135]" : "text-gray-500"
      }`}
    >
      <Icon size={20} />
      <span className="text-[10px] leading-none">{label}</span>
    </button>
  );
}
