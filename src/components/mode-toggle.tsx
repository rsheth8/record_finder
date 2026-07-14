"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ModeToggle({ className }: { className?: string }) {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "pressable focus-ring flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted hover:bg-surface-elevated hover:text-foreground",
        className,
      )}
    >
      {isDark ? <Sun className="h-4 w-4 text-accent" /> : <Moon className="h-4 w-4 text-accent" />}
      <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
