import { useMemo } from "react";

import { useAccounts, useBaseCurrency, useRates } from "../api/hooks";
import { currencyColor, currencyFlag } from "../lib/currency";

interface TickerItem {
  currency: string;
  rate: number;
}

/** Every currency in active use against the main account's currency,
 * colored per-currency with a flag icon. */
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

    const mainNow = toBase(main.currency);
    const currencies = [...new Set(active.map((a) => a.currency))].filter((c) => c !== main.currency);

    return currencies.map((currency) => ({
      currency: `${currency}/${main.currency}`,
      rate: toBase(currency) / mainNow,
    }));
  }, [accounts, rates, baseCurrency]);

  if (items.length === 0) return null;

  return (
    <div className="glass mb-4 flex flex-wrap items-stretch gap-x-1 gap-y-1 p-1">
      {items.map((item) => (
        <div
          key={item.currency}
          className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2"
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
            style={{ background: `${currencyColor(item.currency.slice(0, 3))}22` }}
          >
            {currencyFlag(item.currency.slice(0, 3))}
          </span>
          <span className="text-xs font-semibold tracking-wide text-gray-300">{item.currency}</span>
          <span className="text-sm font-medium tabular-nums text-gray-100">{item.rate.toFixed(4)}</span>
        </div>
      ))}
    </div>
  );
}
