"use client";

import { useTheme } from "@/components/theme-provider";
import type { ThemeId } from "@/lib/themes";

const AMBIENT_CLASS: Record<ThemeId, string | null> = {
  "midnight-wax": "ambient-bg--grain",
  "record-store-noir": "ambient-bg--grain",
  "analog-warmth": "ambient-bg--paper",
  "neon-crate": "ambient-bg--grid",
  "hifi-minimal": null,
  "jazz-club": "ambient-bg--grain",
};

export function AmbientBackground() {
  const { theme } = useTheme();
  const ambientClass = AMBIENT_CLASS[theme];

  if (!ambientClass) return null;

  return <div className={`ambient-bg ${ambientClass}`} aria-hidden />;
}
