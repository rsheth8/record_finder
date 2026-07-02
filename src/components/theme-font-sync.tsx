"use client";

import { useEffect } from "react";
import { useTheme } from "@/components/theme-provider";
import type { ThemeId } from "@/lib/themes";

const THEME_FONTS: Record<
  ThemeId,
  { body: string; display: string }
> = {
  "midnight-wax": {
    body: "var(--font-geist-sans)",
    display: "var(--font-instrument-serif)",
  },
  "record-store-noir": {
    body: "var(--font-geist-sans)",
    display: "var(--font-fraunces)",
  },
  "analog-warmth": {
    body: "var(--font-dm-sans)",
    display: "var(--font-dm-serif)",
  },
  "neon-crate": {
    body: "var(--font-geist-sans)",
    display: "var(--font-space-grotesk)",
  },
  "hifi-minimal": {
    body: "var(--font-inter)",
    display: "var(--font-inter)",
  },
  "jazz-club": {
    body: "var(--font-source-sans)",
    display: "var(--font-playfair)",
  },
};

export function ThemeFontSync() {
  const { theme } = useTheme();

  useEffect(() => {
    const fonts = THEME_FONTS[theme];
    document.documentElement.style.setProperty("--font-body", fonts.body);
    document.documentElement.style.setProperty("--font-display", fonts.display);
  }, [theme]);

  return null;
}
