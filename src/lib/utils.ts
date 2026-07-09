import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  // A DB column that's genuinely SQL NULL comes through as JS `null` here, and
  // `JSON.parse(null)` coerces to `JSON.parse("null")` — valid JSON that
  // successfully parses to `null`, silently bypassing `fallback` without ever
  // throwing. Guard explicitly rather than relying on JSON.parse to reject it.
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
