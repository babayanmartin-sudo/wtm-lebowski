export type Granularity = "month" | "week" | "custom";
export type SeriesGranularity = "day" | "week" | "month";

export interface Period {
  from: string;
  to: string;
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function monthPeriod(anchor: Date): Period {
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: toISO(from), to: toISO(to) };
}

export function weekPeriod(anchor: Date): Period {
  const day = anchor.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { from: toISO(monday), to: toISO(sunday) };
}

export function shiftAnchor(anchor: Date, granularity: "month" | "week", dir: 1 | -1): Date {
  if (granularity === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir * 7);
}

export function periodLabel(granularity: Granularity, from: string, to: string): string {
  const f = parseISO(from);
  const t = parseISO(to);
  if (granularity === "month") {
    return f.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  const fromStr = f.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const toStr = t.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fromStr} – ${toStr}`;
}

export function bucketLabel(iso: string, granularity: SeriesGranularity): string {
  const d = parseISO(iso);
  if (granularity === "month") return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function bucketRange(iso: string, granularity: SeriesGranularity): Period {
  const d = parseISO(iso);
  if (granularity === "day") return { from: iso, to: iso };
  if (granularity === "week") {
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
    return { from: iso, to: toISO(end) };
  }
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: iso, to: toISO(end) };
}
