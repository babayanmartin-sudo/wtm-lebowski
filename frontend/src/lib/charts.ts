/** Shared Recharts <Tooltip> styling matching the app's theme
 * (was hardcoded gray-700/white in 4 places, clashing with the near-black UI). */
export const chartTooltipProps = {
  contentStyle: {
    background: "var(--color-panel)",
    border: "1px solid var(--color-line)",
    borderRadius: 4,
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    color: "#dfe8e4",
    padding: 8,
  },
  wrapperStyle: { color: "#dfe8e4" },
  labelStyle: { color: "#dfe8e4" },
  itemStyle: { color: "#dfe8e4" },
} as const;

/** Signal Room chart line/bar/axis colors — amber accent, muted graphite-green
 * grid/axis, semantic emerald/rose kept for income/expense (unchanged role). */
export const CHART_COLORS = {
  accent: "#ffb545",
  grid: "#22302c",
  axis: "#6f8078",
  income: "#5fd98a",
  expense: "#ff6b5e",
} as const;
