import { useEffect, useState } from "react";

/** useState backed by sessionStorage — persists across navigation, clears when the tab/session ends. */
export function useSessionState<T>(key: string, initial: T, override?: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `et.${key}`;
  const [state, setState] = useState<T>(() => {
    if (override !== undefined) return override;
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // storage unavailable/full — filters just won't persist this time
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, state]);

  return [state, setState];
}
