import { useEffect, useState } from "react";

export interface Toast {
  id: number;
  message: string;
}

let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<(t: Toast[]) => void>();

function emit() {
  for (const l of listeners) l([...toasts]);
}

/** Fire a success toast from anywhere — no provider/context wiring needed. */
export function toast(message: string) {
  const t = { id: nextId++, message };
  toasts = [...toasts, t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, 2500);
}

export function useToasts(): Toast[] {
  const [state, setState] = useState(toasts);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}
