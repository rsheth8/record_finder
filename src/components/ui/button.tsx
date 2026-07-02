import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
          variant === "primary" &&
            "bg-accent text-[var(--color-text-inverse)] hover:bg-accent-hover",
          variant === "secondary" &&
            "bg-surface-elevated text-foreground hover:opacity-90",
          variant === "ghost" && "text-muted hover:bg-surface-elevated hover:text-foreground",
          variant === "outline" &&
            "border border-border text-foreground hover:bg-surface",
          variant === "destructive" &&
            "bg-error/15 text-error hover:bg-error/25",
          size === "sm" && "h-8 px-3 text-sm",
          size === "md" && "h-10 px-4 text-sm",
          size === "lg" && "h-12 px-6 text-base",
          size === "icon" && "h-10 w-10",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
