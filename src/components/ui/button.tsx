import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
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
            "bg-violet-600 text-white hover:bg-violet-500",
          variant === "secondary" &&
            "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
          variant === "ghost" && "text-zinc-300 hover:bg-zinc-800",
          variant === "outline" &&
            "border border-zinc-700 text-zinc-200 hover:bg-zinc-900",
          size === "sm" && "h-8 px-3 text-sm",
          size === "md" && "h-10 px-4 text-sm",
          size === "lg" && "h-12 px-6 text-base",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
