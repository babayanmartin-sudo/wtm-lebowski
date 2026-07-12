const FLAGS: Record<string, string> = {
  AED: "🇦🇪",
  USD: "🇺🇸",
  EUR: "🇪🇺",
  RUB: "🇷🇺",
  AMD: "🇦🇲",
  GBP: "🇬🇧",
  CHF: "🇨🇭",
  TRY: "🇹🇷",
  GEL: "🇬🇪",
  RSD: "🇷🇸",
};

export function currencyFlag(code: string): string {
  return FLAGS[code] ?? "💱";
}

const TICKER_COLORS = ["#ffb545", "#6366f1", "#22d3ee", "#f472b6", "#fb923c", "#34d399", "#f43f5e", "#a78bfa"];

export function currencyColor(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return TICKER_COLORS[hash % TICKER_COLORS.length];
}
