/** Max concierge queue spots offered per release, regardless of how many
 * Discogs listings exist — keeps the cap meaningful even on releases with
 * hundreds of copies for sale, where "one per listing" wouldn't feel scarce. */
export const RESERVATION_CAP_PER_RELEASE = 5;

/** A release with few real listings shouldn't offer more concierge spots than
 * it has stock for. Capped at `RESERVATION_CAP_PER_RELEASE` either way. */
export function reservationCapForRelease(numForSale: number): number {
  return Math.max(0, Math.min(numForSale, RESERVATION_CAP_PER_RELEASE));
}
