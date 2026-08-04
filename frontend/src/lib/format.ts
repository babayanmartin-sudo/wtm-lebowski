/** Mirrors backend get_base_currency(): whichever account is flagged
 * is_main. If none is set, the shared currency when every account uses
 * the same one — only falls back to "AED" (the app's fixed rate-cache
 * anchor) when that's still ambiguous. */
export function getBaseCurrency(accounts: { currency: string; is_main: boolean; archived?: boolean }[]): string {
  const main = accounts.find((a) => a.is_main);
  if (main) return main.currency;
  const currencies = new Set(accounts.filter((a) => !a.archived).map((a) => a.currency));
  return currencies.size === 1 ? [...currencies][0] : "AED";
}

/** Whether currency labels/conversion lines are worth showing at all —
 * pointless noise when every account already uses the same currency. */
export function hasMultipleCurrencies(accounts: { currency: string; archived?: boolean }[]): boolean {
  return new Set(accounts.filter((a) => !a.archived).map((a) => a.currency)).size > 1;
}

export function fmtMoney(amount: number, currency?: string): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return currency ? `${formatted} ${currency}` : formatted;
}

export function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtMonth(month: string): string {
  return new Date(month + "-01T00:00:00").toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

function localISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function today(): string {
  return localISO();
}

export function currentMonth(): string {
  return localISO().slice(0, 7);
}
