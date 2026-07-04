import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  type PickerMode,
  isSameWeek,
  monthGrid,
  parseISO,
  periodLabel,
  sameDay,
  toISO,
} from "../lib/period";

const MODE_LABEL: Record<PickerMode, string> = { day: "Day", week: "Week", month: "Month", year: "Year" };

export default function PeriodPicker({
  mode,
  date,
  modes = ["day", "week", "month", "year"],
  onChange,
}: {
  mode: PickerMode;
  date: string; // ISO anchor date
  modes?: PickerMode[];
  onChange: (mode: PickerMode, date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parseISO(date).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parseISO(date).getMonth());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const anchor = parseISO(date);
    setViewYear(anchor.getFullYear());
    setViewMonth(anchor.getMonth());
  }, [open, date]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selected = parseISO(date);

  function pick(newMode: PickerMode, newDate: Date) {
    onChange(newMode, toISO(newDate));
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
      <button className="input flex w-56 items-center gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <Calendar size={14} className="shrink-0 text-gray-500" />
        <span className="truncate">{periodLabel(mode, date)}</span>
      </button>

      {open && (
        <div className="glass absolute top-full left-0 z-30 mt-2 w-72 p-3 shadow-xl">
          {modes.length > 1 && (
            <div className="mb-3 flex rounded-lg bg-white/5 p-1 text-xs">
              {modes.map((m) => (
                <button
                  key={m}
                  onClick={() => onChange(m, date)}
                  className={`flex-1 rounded-md py-1 transition-colors ${
                    mode === m ? "bg-indigo-500 text-white" : "text-gray-400 hover:text-gray-200"
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
                    className={`grid grid-cols-7 gap-0.5 rounded ${weekActive ? "bg-indigo-500/20" : ""}`}
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
                          } ${isSel ? "bg-indigo-500 text-white" : "hover:bg-white/10"}`}
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
                        isSel ? "bg-indigo-500 text-white" : "text-gray-200 hover:bg-white/10"
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
                      y === selected.getFullYear() ? "bg-indigo-500 text-white" : "text-gray-200 hover:bg-white/10"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
