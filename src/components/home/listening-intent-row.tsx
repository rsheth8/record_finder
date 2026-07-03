import Link from "next/link";
import { CarouselRow } from "@/components/discover/carousel-row";
import {
  getSpotifySnapshot,
  getWishlist,
  getCachedRecommendations,
} from "@/lib/db/queries";
import { getListeningIntentNudges } from "@/lib/recommendations/listening-intent";

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
    <section className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2">
      <div className="mb-3 flex items-center justify-between px-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
        <h2 className="font-display text-xl font-semibold">
          You&apos;ve been playing this a lot
        </h2>
        <Link href="/discover" className="text-sm text-accent hover:underline">
          View all
        </Link>
      </div>
      <CarouselRow title="" items={nudges.map((n) => n.vinyl)} bleed rowIndex={1} />
    </section>
  );
}
