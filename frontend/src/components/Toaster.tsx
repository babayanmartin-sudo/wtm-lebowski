import { Check } from "lucide-react";

import { useToasts } from "../lib/toast";

/** One consistent "it worked" idiom — was previously inline text on one
 * page, a modal success panel on another, a full-page panel on a third,
 * and nothing at all everywhere else. */
export default function Toaster() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed right-4 bottom-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="glass flex items-center gap-2 border-emerald-500/30 px-4 py-2.5 text-sm text-gray-100 shadow-xl"
        >
          <Check size={15} className="shrink-0 text-emerald-400" />
          {t.message}
        </div>
      ))}
    </div>
  );
}
