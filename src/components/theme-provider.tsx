"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_MODE,
  MODE_STORAGE_KEY,
  type ThemeMode,
  isThemeMode,
} from "@/lib/themes";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyMode(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
}

// localStorage-backed store so the mode reads as external state (no
// setState-in-effect). Same-tab writes notify via an explicit listener set;
// cross-tab writes arrive through the native "storage" event.
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function readStoredMode(): ThemeMode {
  const stored = localStorage.getItem(MODE_STORAGE_KEY);
  return stored && isThemeMode(stored) ? stored : DEFAULT_MODE;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSyncExternalStore(
    subscribe,
    readStoredMode,
    () => DEFAULT_MODE,
  );

  // Keep the DOM attribute in sync with the active mode. Pure external-system
  // sync — no React state is set here.
  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    localStorage.setItem(MODE_STORAGE_KEY, next);
    applyMode(next);
    listeners.forEach((l) => l());
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  return (
    <ThemeContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { mode: DEFAULT_MODE, setMode: () => {}, toggleMode: () => {} };
  }
  return ctx;
}
