"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "record-finder-recent-searches";
const MAX_RECENT = 6;

// localStorage-backed so recent searches survive reloads and stay in sync
// across tabs, read through useSyncExternalStore (SSR-safe, no
// setState-in-effect). Same pattern as the theme store.
const listeners = new Set<() => void>();
let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]) {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage full/unavailable — recent searches just won't persist
  }
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null; // another tab wrote — invalidate so read() re-parses
      callback();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: string[] = [];

export function useRecentSearches() {
  const recent = useSyncExternalStore(subscribe, read, () => EMPTY);

  const add = useCallback((rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) return;
    const current = read();
    // Case-insensitive dedup, newest first, capped.
    const deduped = current.filter((q) => q.toLowerCase() !== query.toLowerCase());
    write([query, ...deduped].slice(0, MAX_RECENT));
  }, []);

  const remove = useCallback((query: string) => {
    write(read().filter((q) => q !== query));
  }, []);

  const clear = useCallback(() => write([]), []);

  return { recent, add, remove, clear };
}
