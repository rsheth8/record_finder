export const THEME_MODES = ["dark", "light"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

export const DEFAULT_MODE: ThemeMode = "dark";

export const MODE_STORAGE_KEY = "record-finder-mode";

export function isThemeMode(value: string): value is ThemeMode {
  return (THEME_MODES as readonly string[]).includes(value);
}
