import { TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";

import { useAccounts, useBaseCurrency, useRates } from "../api/hooks";
import { currencyColor, currencyFlag } from "../lib/currency";

interface TickerItem {
  currency: string;
  rate: number;
  pctChange: number;
}

/** Live-feed style ticker: every currency in active use against the main
 * account's currency, colored per-currency, red/green by day-over-day move. */
export default function RateTicker() {
  const { data: accounts = [] } = useAccounts();
  const { data: rates = [] } = useRates();
  const { data: baseCurrency } = useBaseCurrency();

  const items = useMemo<TickerItem[]>(() => {
    const active = accounts.filter((a) => !a.archived);
    const main = active.find((a) => a.is_main) ?? active[0];
    if (!main) return [];

    const base = baseCurrency?.base;
    const rateMap = new Map(rates.map((r) => [r.currency, r]));

    function toBase(currency: string): number {
      if (currency === base) return 1;
      return rateMap.get(currency)?.rate_to_base ?? 1;
    }
    function prevToBase(currency: string): number {
      if (currency === base) return 1;
      const r = rateMap.get(currency);
      return r?.previous_rate_to_base ?? r?.rate_to_base ?? 1;
    }

    const mainNow = toBase(main.currency);
    const mainPrev = prevToBase(main.currency);
    const currencies = [...new Set(active.map((a) => a.currency))].filter((c) => c !== main.currency);

    return currencies.map((currency) => {
      const now = toBase(currency) / mainNow;
      const prev = prevToBase(currency) / mainPrev;
      const pctChange = prev ? ((now - prev) / prev) * 100 : 0;
      return { currency: `${currency}/${main.currency}`, rate: now, pctChange };
    });
  }, [accounts, rates, baseCurrency]);

  if (items.length === 0) return null;

  const track = [...items, ...items]; // duplicated for a seamless scroll loop

  return (
    <div className="glass mb-4 overflow-hidden p-0">
      <div className="rate-ticker-track flex w-max items-stretch">
        {track.map((item, i) => {
          const up = item.pctChange > 0.0005;
          const down = item.pctChange < -0.0005;
          return (
            <div
              key={`${item.currency}-${i}`}
              className="flex shrink-0 items-center gap-2 border-r border-white/5 px-4 py-2.5"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                style={{ background: `${currencyColor(item.currency.slice(0, 3))}22` }}
              >
                {currencyFlag(item.currency.slice(0, 3))}
              </span>
              <span className="text-xs font-semibold tracking-wide text-gray-300">{item.currency}</span>
              <span className="text-sm font-medium tabular-nums text-gray-100">{item.rate.toFixed(4)}</span>
              <span
                className={`flex items-center gap-0.5 text-xs tabular-nums ${
                  up ? "text-emerald-400" : down ? "text-rose-400" : "text-gray-500"
                }`}
              >
                {up && <TrendingUp size={12} />}
                {down && <TrendingDown size={12} />}
                {(up || down) && `${item.pctChange > 0 ? "+" : ""}${item.pctChange.toFixed(2)}%`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
