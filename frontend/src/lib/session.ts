import { useEffect, useState } from "react";

let warnedStorageUnavailable = false;

/** Warn once per session (not per key) so a broken storage doesn't spam the console on every filter change. */
function warnStorageUnavailable(err: unknown) {
  if (warnedStorageUnavailable) return;
  warnedStorageUnavailable = true;
  console.warn(
    "Session storage is unavailable or full — filters and view preferences won't persist across navigation this session.",
    err,
  );
}

/** useState backed by sessionStorage — persists across navigation, clears when the tab/session ends. */
export function useSessionState<T>(key: string, initial: T, override?: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `et.${key}`;
  const [state, setState] = useState<T>(() => {
    if (override !== undefined) return override;
    try {
      const raw = sessionStorage.getItem(storageKey);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch (err) {
      warnStorageUnavailable(err);
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch (err) {
      // storage unavailable/full — filters just won't persist this time
      warnStorageUnavailable(err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, state]);

  return [state, setState];
}
