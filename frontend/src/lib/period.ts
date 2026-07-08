export type PickerMode = "day" | "week" | "month" | "year" | "custom";
export type SeriesGranularity = "day" | "week" | "month";

export interface Period {
  from: string;
  to: string;
}

/** Custom-range periods are persisted as a single string (same slot as the
 * single-anchor ISO date the other modes use) — "<from>_<to>". */
export function encodeCustomRange(from: string, to: string): string {
  return `${from}_${to}`;
}

export function decodeCustomRange(s: string): Period {
  const [from, to] = s.split("_");
  const fallback = toISO(new Date());
  return { from: from || fallback, to: to || from || fallback };
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dayPeriod(anchor: Date): Period {
  const s = toISO(anchor);
  return { from: s, to: s };
}

export function weekPeriod(anchor: Date): Period {
  const day = anchor.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { from: toISO(monday), to: toISO(sunday) };
}

export function monthPeriod(anchor: Date): Period {
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: toISO(from), to: toISO(to) };
}

export function yearPeriod(anchor: Date): Period {
  const from = new Date(anchor.getFullYear(), 0, 1);
  const to = new Date(anchor.getFullYear(), 11, 31);
  return { from: toISO(from), to: toISO(to) };
}

/** rawDate carries the full persisted string; only "custom" mode needs it
 * (the other modes derive everything from the single `anchor` Date). */
export function periodFor(mode: PickerMode, anchor: Date, rawDate?: string): Period {
  if (mode === "custom") return decodeCustomRange(rawDate ?? "");
  if (mode === "day") return dayPeriod(anchor);
  if (mode === "week") return weekPeriod(anchor);
  if (mode === "year") return yearPeriod(anchor);
  return monthPeriod(anchor);
}

export function shiftAnchor(anchor: Date, mode: PickerMode, dir: 1 | -1): Date {
  if (mode === "custom") return anchor; // custom ranges aren't paged
  if (mode === "day") return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir);
  if (mode === "week") return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir * 7);
  if (mode === "year") return new Date(anchor.getFullYear() + dir, anchor.getMonth(), 1);
  return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
}

export function periodLabel(mode: PickerMode, anchorOrFrom: string): string {
  if (mode === "custom") {
    const { from, to } = decodeCustomRange(anchorOrFrom);
    const fromStr = parseISO(from).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const toStr = parseISO(to).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `${fromStr} – ${toStr}`;
  }
  const f = parseISO(anchorOrFrom);
  if (mode === "day") return f.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (mode === "year") return String(f.getFullYear());
  if (mode === "month") return f.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const week = weekPeriod(f);
  const from = parseISO(week.from);
  const to = parseISO(week.to);
  const fromStr = from.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const toStr = to.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${fromStr} – ${toStr}`;
}

export function bucketLabel(iso: string, granularity: SeriesGranularity): string {
  const d = parseISO(iso);
  if (granularity === "month") return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Series buckets are always exactly a day/week/month — maps 1:1 onto a picker mode. */
export function granularityToMode(g: SeriesGranularity): PickerMode {
  return g;
}

// ---- calendar grid helpers (Monday-first, matching weekPeriod) ----

export const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export const WEEKDAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Weeks (each 7 dates) covering the full calendar-grid view of a month,
 * including the leading/trailing days of neighboring months needed to fill
 * complete Monday-first rows. */
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // days since most recent Monday
  const gridStart = new Date(year, month, 1 - startOffset);
  const weeks: Date[][] = [];
  let cursor = gridStart;
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(cursor);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isSameWeek(a: Date, b: Date): boolean {
  return weekPeriod(a).from === weekPeriod(b).from;
}
