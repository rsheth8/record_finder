import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 rounded border-border accent-accent",
        className,
      )}
      {...props}
    />
  );
});
Checkbox.displayName = "Checkbox";
