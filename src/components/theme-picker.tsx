"use client";

import { useTheme } from "@/components/theme-provider";
import { THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { Palette } from "lucide-react";
import { useState } from "react";

export function ThemePicker({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Palette className="h-4 w-4 text-accent" />
        <span className="hidden sm:inline">Theme</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="listbox"
            aria-label="Choose theme"
            className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-surface p-2 shadow-lg"
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={theme === t.id}
                onClick={() => {
                  setTheme(t.id as ThemeId);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                  theme === t.id
                    ? "bg-accent-muted text-foreground"
                    : "hover:bg-surface-elevated",
                )}
              >
                <div className="flex shrink-0 gap-0.5 pt-0.5">
                  {t.swatches.map((color) => (
                    <span
                      key={color}
                      className="h-4 w-4 rounded-full border border-border-subtle"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
