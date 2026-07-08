import { getSimilarReleases } from "@/lib/discogs/client";
import { dedupeRecommendations } from "@/lib/recommendations/dedupe";
import { enrichRecommendations } from "@/lib/recommendations/enrich";
import { CarouselRow } from "@/components/discover/carousel-row";
import { FULL_BLEED } from "@/lib/layout";
import { cn } from "@/lib/utils";
import type { DiscogsRelease } from "@/lib/types";

/** Async Server Component rendered inside a `<Suspense>` boundary (see
 * AlbumDetail) so it streams in independently of the main album content.
 * Full enrichment — one Discogs release call per pick, rate-limited to
 * ~1/sec — can take several seconds; without streaming that would block the
 * whole page behind a "more like this" row at the bottom. */
export async function SimilarReleases({
  release,
}: {
  release: Pick<DiscogsRelease, "id" | "genres" | "styles">;
}) {
  const raw = await getSimilarReleases(release).catch(() => []);
  const deduped = dedupeRecommendations(raw).slice(0, 12);
  const similar = await enrichRecommendations(deduped);

  if (similar.length === 0) return null;

  return (
    <section className={cn(FULL_BLEED, "stream-fade-in mt-8")}>
      <CarouselRow title="More like this" items={similar} rowIndex={0} />
    </section>
  );
}
