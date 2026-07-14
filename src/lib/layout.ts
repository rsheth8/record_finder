/**
 * Full-bleed breakout pattern, shared by every surface that escapes
 * AppShell's centered `max-w-6xl` container to span the full viewport
 * (Discover feed, Search feed, home carousels, "more like this" rows).
 *
 * `FULL_BLEED` breaks the element out to viewport width; the padding/margin
 * constants re-align inner content with the shell's own gutters at every
 * breakpoint: 1rem on small screens, and `(100vw - 72rem) / 2 + 1rem` once
 * the 72rem (max-w-6xl) container starts floating — i.e. exactly where the
 * shell's content edge sits. Keep these four in sync; they are one formula.
 */
export const FULL_BLEED =
  "relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2";

export const BLEED_PX = "px-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]";
export const BLEED_MX = "mx-4 sm:mx-[max(1rem,calc((100vw-72rem)/2+1rem))]";
export const BLEED_PL = "pl-4 sm:pl-[max(1rem,calc((100vw-72rem)/2+1rem))]";
export const BLEED_PR = "pr-4 sm:pr-[max(1rem,calc((100vw-72rem)/2+1rem))]";

/**
 * Same width formula as BLEED_PL/BLEED_PR, for an edge fade that sits exactly
 * inside the gutter it shares a container with (e.g. a carousel row's
 * overflow-hidden viewport) — sized any wider and it visibly washes out over
 * the first/last card's own artwork instead of just the empty margin.
 */
export const BLEED_FADE_W = "w-4 sm:w-[max(1rem,calc((100vw-72rem)/2+1rem))]";

/**
 * `left` offset matching the same gutter formula — positions an absolutely
 * placed control (e.g. a carousel's left scroll arrow) exactly at the page's
 * content-column edge inside a full-bleed row, so it overlays the first card
 * rather than floating out in the empty bleed margin on wide screens.
 */
export const BLEED_LEFT = "left-4 sm:left-[max(1rem,calc((100vw-72rem)/2+1rem))]";
