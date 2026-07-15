"use client";

import { useEffect, useState } from "react";

/** Returns `value` delayed by `delayMs`, resetting the timer on every change —
 * so a value that's still changing (e.g. an input being typed into) only
 * "settles" once the user pauses. Used to pace search-as-you-type against the
 * rate-limited Discogs API. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
