import { ChevronLeft, ChevronRight, History, Plus, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  useAccounts,
  useDashboard,
  useInsightsAsk,
  useInsightsConversation,
  useInsightsConversations,
  useOverallBudgetStatus,
  useSettings,
} from "../api/hooks";
import type { CategoryTotal, InsightsMessage } from "../api/types";
import PeriodPicker from "../components/PeriodPicker";
import { ColorDot, ErrorState, LoadingState, ProgressBar, Spinner } from "../components/ui";
import { CHART_COLORS, chartTooltipProps } from "../lib/charts";
import { fmtMoney } from "../lib/format";
import { useSessionState } from "../lib/session";
import {
  type PickerMode,
  bucketLabel,
  granularityToMode,
  parseISO,
  periodFor,
  periodLabel,
  shiftAnchor,
  toISO,
} from "../lib/period";

const ALL_MODES: PickerMode[] = ["day", "week", "month", "year", "custom"];

export default function DashboardPage() {
  const [pickerMode, setPickerMode] = useSessionState<PickerMode>("dashboard.mode", "month");
  const [pickerDate, setPickerDate] = useSessionState("dashboard.date", toISO(new Date()));
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const period = useMemo(() => periodFor(pickerMode, parseISO(pickerDate), pickerDate), [pickerMode, pickerDate]);

  const { data, isLoading, isError, error } = useDashboard({
    date_from: period.from,
    date_to: period.to,
    category_id: categoryId ?? undefined,
  });
  const { data: accounts = [] } = useAccounts();
  const { data: overallBudget } = useOverallBudgetStatus();

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const donut = (data?.by_category ?? []).slice(0, 8);
  const donutIncome = (data?.by_category_income ?? []).slice(0, 8);
  const granularityData = data?.series_granularity ?? "day";
  const reportsLink = useMemo(() => {
    const params = new URLSearchParams({ mode: pickerMode, date: pickerDate });
    return `/reports?${params.toString()}`;
  }, [pickerMode, pickerDate]);

  const [periodHistory, setPeriodHistory] = useState<{ mode: PickerMode; date: string }[]>([]);

  function goToMonth() {
    setPickerMode("month");
    setPickerDate(toISO(new Date()));
    setPeriodHistory([]);
  }

  function drillInto(label: string) {
    setPeriodHistory((h) => [...h, { mode: pickerMode, date: pickerDate }]);
    setPickerMode(granularityToMode(granularityData));
    setPickerDate(label);
  }

  function drillBack() {
    setPeriodHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setPickerMode(prev.mode);
      setPickerDate(prev.date);
      return h.slice(0, -1);
    });
  }

  function toggleCategory(id: number | null) {
    if (id === null) return;
    setCategoryId((prev) => (prev === id ? null : id));
  }

  const zoomed = pickerMode !== "month";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Home</h1>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 disabled:opacity-30"
              disabled={pickerMode === "custom"}
              onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, -1)))}
            >
              <ChevronLeft size={16} />
            </button>
            <PeriodPicker
              mode={pickerMode}
              date={pickerDate}
              modes={ALL_MODES}
              triggerClassName="h-9 w-56"
              onChange={(m, d) => {
                setPickerMode(m);
                setPickerDate(d);
                setPeriodHistory([]);
              }}
            />
            <button
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 disabled:opacity-30"
              disabled={pickerMode === "custom"}
              onClick={() => setPickerDate(toISO(shiftAnchor(parseISO(pickerDate), pickerMode, 1)))}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {zoomed && (
            <button className="btn-ghost h-9 px-3 text-sm" title="Back to current month" onClick={goToMonth}>
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>
      </div>

      {zoomed && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
          Filtering by
          <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
            {periodLabel(pickerMode, pickerMode === "custom" ? pickerDate : period.from)}
            <button onClick={goToMonth}>
              <X size={12} />
            </button>
          </span>
        </div>
      )}

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} />
      ) : (
        <>
      <div
        className={`glass grid grid-cols-1 divide-y divide-[var(--color-line)] ${
          overallBudget?.cap != null ? "sm:grid-cols-4" : "sm:grid-cols-3"
        } sm:divide-x sm:divide-y-0`}
      >
        <StatCell label="Net worth" value={data ? fmtMoney(data.net_worth) : "…"} />
        <StatCell label="Income" value={data ? fmtMoney(data.income) : "…"} color="text-emerald-400" />
        <StatCell label="Spent" value={data ? fmtMoney(data.expense) : "…"} color="text-rose-400" />
        {overallBudget?.cap != null && (
          <StatCell
            label="Overall budget"
            value={`${fmtMoney(overallBudget.spent)} / ${fmtMoney(overallBudget.cap)}`}
            color={overallBudget.spent > overallBudget.cap ? "text-rose-400" : "text-gray-100"}
          >
            <ProgressBar value={overallBudget.cap > 0 ? overallBudget.spent / overallBudget.cap : 0} />
          </StatCell>
        )}
      </div>

      <div className="glass p-5">
        <div className="mb-4 flex items-center justify-between">
          <Link
            to={reportsLink}
            className="font-mono text-xs tracking-wide text-gray-500 uppercase transition-colors hover:text-lime-300"
          >
            Income vs spending
          </Link>
          <div className="flex items-center gap-2">
            {periodHistory.length > 0 && (
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={drillBack}>
                <ChevronLeft size={12} /> Back
              </button>
            )}
            {zoomed ? (
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={goToMonth}>
                <RotateCcw size={12} /> Reset
              </button>
            ) : (
              <span className="text-xs text-gray-500">Click a bar to zoom in</span>
            )}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={data?.series ?? []}
            barGap={4}
            onClick={(state) => {
              const label = state?.activeLabel;
              if (typeof label === "string") drillInto(label);
            }}
            className="cursor-pointer"
          >
            <XAxis
              dataKey="label"
              tickFormatter={(v) => bucketLabel(v, granularityData)}
              stroke={CHART_COLORS.axis}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis stroke={CHART_COLORS.axis} fontSize={11} tickLine={false} axisLine={false} width={50} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              {...chartTooltipProps}
              formatter={(v, name) => [v, name]}
              labelFormatter={(v) => bucketLabel(String(v), granularityData)}
            />
            <Bar dataKey="income" fill={CHART_COLORS.income} radius={[2, 2, 0, 0]} />
            <Bar dataKey="expense" fill={CHART_COLORS.expense} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="glass p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-xs tracking-wide text-gray-500 uppercase">Category</h2>
          {categoryId ? (
            <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setCategoryId(null)}>
              <RotateCcw size={12} /> Reset
            </button>
          ) : (
            (donut.length > 0 || donutIncome.length > 0) && (
              <span className="text-xs text-gray-500">Click a slice to filter</span>
            )
          )}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <CategoryPie
            title="Expense"
            items={donut}
            emptyText="No expenses in this period."
            categoryId={categoryId}
            onToggle={toggleCategory}
            baseCurrency={data?.base_currency}
          />
          <CategoryPie
            title="Income"
            items={donutIncome}
            emptyText="No income in this period."
            categoryId={categoryId}
            onToggle={toggleCategory}
            baseCurrency={data?.base_currency}
          />
        </div>
      </div>

      <div className="glass p-5">
        <PanelHeader to="/accounts" label="Accounts" />
        <div className="flex flex-col gap-2.5">
          {activeAccounts.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm">
              <ColorDot color={a.color} />
              <span className="flex-1 text-gray-300">{a.name}</span>
              <span className="font-mono tabular-nums">{fmtMoney(a.balance, a.currency)}</span>
            </div>
          ))}
          {activeAccounts.length === 0 && <p className="text-sm text-gray-500">No accounts yet.</p>}
        </div>
      </div>

      <AskWidget />
        </>
      )}
    </div>
  );
}

function PanelHeader({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="mb-3 flex items-center justify-between font-mono text-xs tracking-wide text-gray-500 uppercase transition-colors hover:text-lime-300"
    >
      {label}
      <ChevronRight size={14} className="text-gray-500" />
    </Link>
  );
}

function CategoryPie({
  title,
  items,
  emptyText,
  categoryId,
  onToggle,
  baseCurrency,
}: {
  title: string;
  items: CategoryTotal[];
  emptyText: string;
  categoryId: number | null;
  onToggle: (id: number | null) => void;
  baseCurrency: string | undefined;
}) {
  // a categoryId belonging to the other pie's kind shouldn't dim this one
  const activeCategoryId = categoryId != null && items.some((i) => i.category_id === categoryId)
    ? categoryId
    : null;

  return (
    <div>
      <h3 className="mb-1 font-mono text-xs tracking-wide text-gray-500 uppercase">{title}</h3>
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">{emptyText}</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={items}
                dataKey="amount"
                nameKey="name"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={3}
                strokeWidth={0}
                onClick={(entry) => onToggle(entry.category_id)}
                className="cursor-pointer"
              >
                {items.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    opacity={activeCategoryId && entry.category_id !== activeCategoryId ? 0.35 : 1}
                  />
                ))}
              </Pie>
              <Tooltip
                {...chartTooltipProps}
                formatter={(v, name) => [fmtMoney(Number(v), baseCurrency), name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-col gap-1.5">
            {items.map((c) => (
              <button
                key={c.name}
                onClick={() => onToggle(c.category_id)}
                className={`flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-white/5 ${
                  activeCategoryId && c.category_id !== activeCategoryId ? "opacity-40" : ""
                }`}
              >
                <ColorDot color={c.color} />
                <span className="flex-1 text-gray-300">{c.name}</span>
                <span className="font-mono tabular-nums text-gray-400">{fmtMoney(c.amount)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  color,
  children,
}: {
  label: string;
  value: string;
  color?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      <span className="font-mono text-[11px] tracking-widest text-gray-500 uppercase">{label}</span>
      <span className={`font-mono text-lg tracking-tight tabular-nums ${color ?? ""}`}>{value}</span>
      {children}
    </div>
  );
}

/** Ephemeral chat — history lives only in this component's state, nothing
 * persisted server-side. Each question is answered by an LLM calling
 * read-only aggregation tools against this app's own data, not by dumping
 * transaction history into the prompt (see services/insights_tools.py). */
/** Assistant replies often come back as markdown (bullet lists, bold
 * numbers) — Tailwind's reset strips list/paragraph spacing by default, so
 * map each element to sized/spaced classes instead of relying on a
 * typography plugin. */
function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-4 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-gray-100">{children}</strong>,
        code: ({ children }) => (
          <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs">{children}</code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function AskWidget() {
  const { data: settings } = useSettings();
  const [conversationId, setConversationId] = useSessionState<number | null>("dashboard.askConversationId", null);
  const [messages, setMessages] = useState<InsightsMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const ask = useInsightsAsk();
  const conversation = useInsightsConversation(conversationId);
  const { data: conversations = [] } = useInsightsConversations();
  const loadedConvoRef = useRef<number | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const configured = !!settings?.llm_provider && !!settings?.llm_api_key;

  useEffect(() => {
    if (conversationId !== null && conversation.data && loadedConvoRef.current !== conversationId) {
      setMessages(conversation.data.messages);
      loadedConvoRef.current = conversationId;
    }
  }, [conversationId, conversation.data]);

  useEffect(() => {
    if (!historyOpen) return;
    function onDocClick(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setHistoryOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [historyOpen]);

  function newChat() {
    setConversationId(null);
    setMessages([]);
    setError("");
    setHistoryOpen(false);
  }

  function loadConversation(id: number) {
    setConversationId(id);
    setHistoryOpen(false);
  }

  async function send() {
    const question = input.trim();
    if (!question || ask.isPending) return;
    setError("");
    setInput("");
    const nextMessages: InsightsMessage[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    try {
      const result = await ask.mutateAsync({ message: question, conversation_id: conversationId });
      setMessages([...nextMessages, { role: "assistant", content: result.reply }]);
      if (conversationId === null) {
        loadedConvoRef.current = result.conversation_id;
        setConversationId(result.conversation_id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get an answer");
    }
  }

  return (
    <div className="glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 font-mono text-xs tracking-wide text-gray-500 uppercase">
          <Sparkles size={14} /> Ask
        </h2>
        {configured && (
          <div className="flex items-center gap-1">
            <div ref={historyRef} className="relative">
              <button
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
                title="Past conversations"
                onClick={() => setHistoryOpen((o) => !o)}
              >
                <History size={14} />
              </button>
              {historyOpen && (
                <div className="absolute right-0 z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-xl border border-white/10 bg-[var(--color-panel)] py-1 shadow-xl">
                  {conversations.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">No past conversations.</p>
                  ) : (
                    conversations.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => loadConversation(c.id)}
                        className={`block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-white/5 ${
                          c.id === conversationId ? "text-lime-300" : "text-gray-300"
                        }`}
                      >
                        {c.title || "Untitled"}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10"
              title="New chat"
              onClick={newChat}
            >
              <Plus size={14} />
            </button>
          </div>
        )}
      </div>
      {!configured ? (
        <p className="text-sm text-gray-500">
          Configure the AI Assistant in Profile to ask questions about your spending.
        </p>
      ) : (
        <>
          {messages.length > 0 && (
            <div className="mb-4 flex max-h-80 flex-col gap-3 overflow-y-auto">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user" ? "self-end bg-white/10 text-gray-100" : "self-start bg-white/5 text-gray-300"
                  }`}
                >
                  {m.role === "assistant" ? <ChatMarkdown content={m.content} /> : m.content}
                </div>
              ))}
              {ask.isPending && (
                <div className="self-start rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-400">
                  <Spinner size={14} />
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              className="input flex-1"
              placeholder="e.g. how much did I spend on groceries last month?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              disabled={ask.isPending}
            />
            <button className="btn-primary h-9" onClick={send} disabled={ask.isPending || !input.trim()}>
              <Send size={14} />
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
        </>
      )}
    </div>
  );
}
