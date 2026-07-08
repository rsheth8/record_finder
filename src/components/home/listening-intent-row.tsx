import Link from "next/link";
import { CarouselRow } from "@/components/discover/carousel-row";
import {
  getSpotifySnapshot,
  getWishlist,
  getCachedRecommendations,
} from "@/lib/db/queries";
import { getListeningIntentNudges } from "@/lib/recommendations/listening-intent";
import { BLEED_PX, FULL_BLEED } from "@/lib/layout";
import { cn } from "@/lib/utils";

/** Async Server Component rendered inside a `<Suspense>` boundary (see Home
 * page) so the rate-limited Discogs validation calls it makes don't block the
 * rest of the page — same reasoning as `SimilarReleases`/`ComparePressings`
 * on the album page. Computed independently of the hour-long recommendation
 * cache, since "what you've been playing this week" is inherently
 * time-sensitive in a way a cached feed shouldn't be. */
export async function ListeningIntentRow({ userId }: { userId: string }) {
  const [snapshot, wishlist, cachedRecs] = await Promise.all([
    getSpotifySnapshot(userId),
    getWishlist(userId),
    getCachedRecommendations(userId),
  ]);

  const excludeReleaseIds = new Set(
    (cachedRecs ?? []).map((r) => r.discogsReleaseId),
  );
  const nudges = await getListeningIntentNudges(snapshot, wishlist, excludeReleaseIds);

  if (nudges.length === 0) return null;

  return (
    <section className={cn(FULL_BLEED, "stream-fade-in")}>
      <div className={cn(BLEED_PX, "mb-3 flex items-center justify-between")}>
        <h2 className="font-display text-xl font-semibold">
          You&apos;ve been playing this a lot
        </h2>
        <Link href="/discover" className="focus-ring rounded-sm text-sm text-accent hover:underline">
          View all
        </Link>
      </div>
      <CarouselRow title="" items={nudges.map((n) => n.vinyl)} bleed rowIndex={1} />
    </section>
  );
}
