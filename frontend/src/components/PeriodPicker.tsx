import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  type PickerMode,
  decodeCustomRange,
  encodeCustomRange,
  isSameWeek,
  monthGrid,
  parseISO,
  periodFor,
  periodLabel,
  sameDay,
  toISO,
} from "../lib/period";

const MODE_LABEL: Record<PickerMode, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
  custom: "Custom",
};

export default function PeriodPicker({
  mode,
  date,
  modes = ["day", "week", "month", "year"],
  onChange,
  triggerClassName = "w-56",
}: {
  mode: PickerMode;
  date: string; // ISO anchor date
  modes?: PickerMode[];
  onChange: (mode: PickerMode, date: string) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorFor = (m: PickerMode, d: string) => (m === "custom" ? parseISO(decodeCustomRange(d).from) : parseISO(d));
  const [viewYear, setViewYear] = useState(() => anchorFor(mode, date).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => anchorFor(mode, date).getMonth());
  const [customFrom, setCustomFrom] = useState(() => decodeCustomRange(date).from);
  const [customTo, setCustomTo] = useState(() => decodeCustomRange(date).to);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const anchor = anchorFor(mode, date);
    setViewYear(anchor.getFullYear());
    setViewMonth(anchor.getMonth());
    if (mode === "custom") {
      const range = decodeCustomRange(date);
      setCustomFrom(range.from);
      setCustomTo(range.to);
    }
  }, [open, date, mode]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = anchorFor(mode, date);

  function pick(newMode: PickerMode, newDate: Date) {
    onChange(newMode, toISO(newDate));
    setOpen(false);
  }

  function selectMode(newMode: PickerMode) {
    if (newMode === mode) return;
    if (newMode === "custom") {
      const range = mode === "custom" ? decodeCustomRange(date) : periodFor(mode, parseISO(date));
      onChange("custom", encodeCustomRange(range.from, range.to));
      return;
    }
    onChange(newMode, toISO(anchorFor(mode, date)));
  }

  function applyCustomRange() {
    onChange("custom", encodeCustomRange(customFrom, customTo));
    setOpen(false);
  }

  function shiftGridMonth(dir: 1 | -1) {
    setViewMonth((m) => {
      const next = m + dir;
      if (next < 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      if (next > 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return next;
    });
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        className={`input flex items-center gap-2 text-left ${triggerClassName}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Calendar size={14} className="shrink-0 text-gray-500" />
        <span className="truncate">{periodLabel(mode, date)}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[var(--color-panel)] p-3 shadow-xl">
          {modes.length > 1 && (
            <div className="mb-3 flex rounded-lg bg-white/5 p-1 text-xs">
              {modes.map((m) => (
                <button
                  key={m}
                  onClick={() => selectMode(m)}
                  className={`flex-1 rounded-md py-1 transition-colors ${
                    mode === m ? "bg-lime-400 text-black" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          )}

          {(mode === "day" || mode === "week") && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <button className="rounded p-1 text-gray-400 hover:bg-white/10" onClick={() => shiftGridMonth(-1)}>
                  <ChevronLeft size={15} />
                </button>
                <span className="text-sm font-medium">
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button className="rounded p-1 text-gray-400 hover:bg-white/10" onClick={() => shiftGridMonth(1)}>
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-500">
                {WEEKDAY_NAMES.map((w) => (
                  <div key={w} className="py-1">
                    {w}
                  </div>
                ))}
              </div>
              {monthGrid(viewYear, viewMonth).map((week, wi) => {
                const weekActive = mode === "week" && week.some((d) => isSameWeek(d, selected));
                return (
                  <div
                    key={wi}
                    className={`grid grid-cols-7 gap-0.5 rounded ${weekActive ? "bg-lime-500/20" : ""}`}
                  >
                    {week.map((d) => {
                      const inMonth = d.getMonth() === viewMonth;
                      const isSel = mode === "day" && sameDay(d, selected);
                      return (
                        <button
                          key={d.toISOString()}
                          onClick={() => pick(mode, d)}
                          className={`rounded py-1.5 text-xs tabular-nums transition-colors ${
                            !inMonth ? "text-gray-600" : "text-gray-200"
                          } ${isSel ? "bg-lime-400 text-black" : "hover:bg-white/10"}`}
                        >
                          {d.getDate()}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {mode === "month" && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <button
                  className="rounded p-1 text-gray-400 hover:bg-white/10"
                  onClick={() => setViewYear((y) => y - 1)}
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-sm font-medium">{viewYear}</span>
                <button
                  className="rounded p-1 text-gray-400 hover:bg-white/10"
                  onClick={() => setViewYear((y) => y + 1)}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {MONTH_NAMES.map((name, i) => {
                  const isSel = viewYear === selected.getFullYear() && i === selected.getMonth();
                  return (
                    <button
                      key={name}
                      onClick={() => pick("month", new Date(viewYear, i, 1))}
                      className={`rounded-lg py-2 text-xs transition-colors ${
                        isSel ? "bg-lime-400 text-black" : "text-gray-200 hover:bg-white/10"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {mode === "year" && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <button
                  className="rounded p-1 text-gray-400 hover:bg-white/10"
                  onClick={() => setViewYear((y) => y - 12)}
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-sm font-medium">
                  {viewYear - 5} – {viewYear + 6}
                </span>
                <button
                  className="rounded p-1 text-gray-400 hover:bg-white/10"
                  onClick={() => setViewYear((y) => y + 12)}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => viewYear - 5 + i).map((y) => (
                  <button
                    key={y}
                    onClick={() => pick("year", new Date(y, 0, 1))}
                    className={`rounded-lg py-2 text-xs tabular-nums transition-colors ${
                      y === selected.getFullYear() ? "bg-lime-400 text-black" : "text-gray-200 hover:bg-white/10"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "custom" && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  From
                  <input
                    type="date"
                    className="input py-1.5 text-xs"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  To
                  <input
                    type="date"
                    className="input py-1.5 text-xs"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </label>
              </div>
              <button
                className="btn-primary py-1.5 text-xs"
                disabled={!customFrom || !customTo || customFrom > customTo}
                onClick={applyCustomRange}
              >
                Apply
              </button>
              {customFrom && customTo && customFrom > customTo && (
                <p className="text-xs text-rose-400">"From" must be on or before "To".</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
