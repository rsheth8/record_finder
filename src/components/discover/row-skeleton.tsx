import { BLEED_PL, BLEED_PR, BLEED_PX } from "@/lib/layout";
import { cn } from "@/lib/utils";

const CARD_WIDTH = "w-[140px] sm:w-[160px] md:w-[175px] lg:w-[190px]";
const PLACEHOLDER_COUNT = 6;

/** Pulsing placeholder for a browse row's first page — shown while
 * `BrowseRow` fetches so the vertical scroll never hits visible dead space
 * while waiting on the Discogs-rate-limited fetch behind it. */
export function RowSkeleton() {
  return (
    <section className="pb-2" aria-hidden>
      <div className={cn("mb-4 flex items-center gap-3", BLEED_PL, BLEED_PR)}>
        <span className="row-accent-line shrink-0 animate-pulse bg-foreground/10" />
        <div className="h-5 w-32 animate-pulse rounded bg-foreground/10 sm:w-40" />
      </div>
      <div className={cn("flex gap-3 overflow-hidden sm:gap-4", BLEED_PX)}>
        {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
          <div
            key={i}
            className={cn("aspect-[2/3] shrink-0 animate-pulse rounded-lg bg-foreground/10", CARD_WIDTH)}
          />
        ))}
      </div>
    </section>
  );
}
