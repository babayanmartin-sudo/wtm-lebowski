/** Shared Recharts <Tooltip> styling matching the app's dark-glass theme
 * (was hardcoded gray-700/white in 4 places, clashing with the near-black UI). */
export const chartTooltipProps = {
  contentStyle: {
    background: "#12130d",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 12,
    fontSize: 12,
    color: "#e5e7eb",
    padding: 8,
  },
  wrapperStyle: { color: "#e5e7eb" },
  labelStyle: { color: "#e5e7eb" },
  itemStyle: { color: "#e5e7eb" },
} as const;
