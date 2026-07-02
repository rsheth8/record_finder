import { cn } from "@/lib/utils";
import { SelectHTMLAttributes, forwardRef } from "react";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-violet-600 focus:outline-none",
          className,
        )}
        {...props}
      />
    );
  },
);
Select.displayName = "Select";
