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
