import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

type RangeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/** Styled range slider matching the app's zinc/violet primitives. Cross-browser
 * thumb styling (WebKit + Firefox) plus a visible focus ring for keyboard users. */
export const Range = forwardRef<HTMLInputElement, RangeProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      className={cn(
        "h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-violet-500",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50",
        "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:transition-transform hover:[&::-webkit-slider-thumb]:scale-110",
        "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-violet-500",
        className,
      )}
      {...props}
    />
  ),
);
Range.displayName = "Range";
