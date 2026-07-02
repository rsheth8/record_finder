import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-zinc-800 bg-zinc-900/80 py-2.5 px-4 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-600 focus:outline-none focus:ring-1 focus:ring-violet-600",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
