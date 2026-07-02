import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

type RangeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Styled range slider using theme tokens. Cross-browser thumb styling plus a
 * visible focus ring for keyboard users. */
export const Range = forwardRef<HTMLInputElement, RangeProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      className={cn(
        "h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-elevated accent-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110",
        "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent",
        className,
      )}
      {...props}
    />
  ),
);
Range.displayName = "Range";
