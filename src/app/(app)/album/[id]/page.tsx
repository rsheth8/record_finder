import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRelease, getSimilarReleases } from "@/lib/discogs/client";
import {
  isInWishlist,
  getReleaseFeedback,
  getCachedRecommendations,
} from "@/lib/db/queries";
import { FeedbackButtons } from "@/components/album/feedback-buttons";
import { CarouselRow } from "@/components/discover/carousel-row";
import { AlbumActions } from "@/components/album/album-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/identity";
import { searchSpotifyAlbum } from "@/lib/spotify/client";
import { usdToCredits, formatUsd } from "@/lib/commerce/pricing";
import { cn } from "@/lib/utils";
import { ArrowLeft, Disc3, Star } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const releaseId = parseInt(id, 10);
  if (isNaN(releaseId)) notFound();

  const release = await getRelease(releaseId);
  if (!release) notFound();

  const session = await auth();
  let spotifyUrl = release.spotifyUrl;

  if (!spotifyUrl && session?.accessToken) {
    const spotifyAlbum = await searchSpotifyAlbum(
      session.accessToken,
      release.artist,
      release.title,
    );
    spotifyUrl = spotifyAlbum?.spotifyUrl ?? null;
  }

  const userId = await getCurrentUserId();
  const inWishlist = userId ? await isInWishlist(userId, releaseId) : false;
  const feedbackSignal = userId ? await getReleaseFeedback(userId, releaseId) : null;
  const marketplace = release.marketplace;
  const forSale = marketplace && marketplace.numForSale > 0;
  const creditCost = usdToCredits(marketplace?.lowestPrice ?? 5);
  const discogsUrl =
    marketplace?.discogsUrl ?? `https://www.discogs.com/sell/release/${releaseId}`;

  // Transparency: if this release is in the visitor's current picks, surface the
  // reasons it was recommended. And a cheap "more like this" row by style/genre.
  const cachedRecs = userId ? (await getCachedRecommendations(userId)) ?? [] : [];
  const recReasons =
    cachedRecs.find((r) => r.discogsReleaseId === releaseId)?.reasons ?? [];
  const similar = await getSimilarReleases(release).catch(() => []);

  return (
    <div className="space-y-0">
      {/* Immersive header */}
      <div className="relative -mx-4 mb-8 overflow-hidden md:-mx-0 md:rounded-xl">
        {release.coverUrl && (
          <div className="absolute inset-0">
            <Image
              src={release.coverUrl}
              alt=""
              fill
              className="object-cover blur-2xl brightness-[0.35] saturate-150"
              unoptimized
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
          </div>
        )}
        <div className="relative px-4 py-8 md:px-8">
          <Link
            href="/discover"
            className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Discover
          </Link>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            <div className="relative mx-auto h-56 w-56 shrink-0 overflow-hidden rounded-xl bg-surface-elevated shadow-2xl sm:mx-0 sm:h-64 sm:w-64">
              {release.coverUrl ? (
                <Image
                  src={release.coverUrl}
                  alt={`${release.title} cover`}
                  fill
                  className="object-cover"
                  unoptimized
                  priority
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted">
                  No cover art
                </div>
              )}
            </div>

            <div className="flex-1 space-y-4 pb-2">
              <div>
                <h1 className="font-display text-3xl font-bold text-foreground md:text-4xl">
                  {release.title}
                </h1>
                <p className="mt-1 text-lg text-muted">
                  {release.artist}
                  {release.year ? ` · ${release.year}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[...release.genres, ...release.styles].slice(0, 6).map((g) => (
                  <Badge key={g} variant="accent">{g}</Badge>
                ))}
              </div>

              {release.communityRating && (
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <Star className="h-4 w-4 fill-warning text-warning" />
                  {release.communityRating.toFixed(1)}/5 on Discogs
                  {release.ratingCount ? ` · ${release.ratingCount.toLocaleString()} ratings` : ""}
                </p>
              )}

              {forSale && marketplace.lowestPrice && (
                <p className="text-2xl font-semibold text-foreground">
                  From {formatUsd(marketplace.lowestPrice)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Desktop actions */}
      <div className="hidden space-y-8 md:block">
        <Card glow>
          <CardTitle>Get this record</CardTitle>
          <CardDescription className="mt-2">
            {forSale
              ? `${marketplace.numForSale} listing${marketplace.numForSale === 1 ? "" : "s"} available on Discogs`
              : "No active listings right now — check back later or save to your wishlist"}
          </CardDescription>
          <div className="mt-5">
            <AlbumActions
              discogsReleaseId={releaseId}
              title={release.title}
              artist={release.artist}
              coverUrl={release.coverUrl}
              year={release.year}
              creditCost={creditCost}
              lowestPriceUsd={marketplace?.lowestPrice ?? null}
              numForSale={marketplace?.numForSale ?? 0}
              signedIn={!!session?.user}
              discogsUrl={discogsUrl}
              spotifyUrl={spotifyUrl}
              inWishlist={inWishlist}
              forSale={!!forSale}
            />
          </div>
          {userId && (
            <div className="mt-6 space-y-2 border-t border-border-subtle pt-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Tune your recommendations
              </p>
              <FeedbackButtons
                discogsReleaseId={releaseId}
                artist={release.artist}
                initialSignal={feedbackSignal}
              />
            </div>
          )}
        </Card>
      </div>

      {recReasons.length > 0 && (
        <Card className="border-violet-800/40 bg-violet-950/10">
          <CardTitle>Why we recommended this</CardTitle>
          <ul className="mt-3 space-y-1.5">
            {recReasons.map((reason) => (
              <li key={reason} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                {reason}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {release.formats.length > 0 && (
        <Card className="mt-8">
          <div className="flex items-start gap-4">
            <div className="vinyl-loader-disc relative h-14 w-14 shrink-0">
              <div className="vinyl-loader-grooves absolute inset-0 rounded-full" />
              <Disc3 className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-accent" />
            </div>
            <div>
              <CardTitle>Pressing info</CardTitle>
              <CardDescription className="mt-2">
                {release.formats.join(" · ")}
              </CardDescription>
            </div>
          </div>
        </Card>
      )}

      {release.tracklist.length > 0 && (
        <Card className="mt-6">
          <CardTitle>Tracklist</CardTitle>
          <ol className="mt-4 divide-y divide-border-subtle">
            {release.tracklist.map((track, i) => (
              <li
                key={`${track.position}-${track.title}`}
                className={cn(
                  "flex justify-between py-2.5 text-sm",
                  i % 2 === 0 ? "bg-surface/30" : "",
                )}
              >
                <span className="text-foreground">
                  <span className="mr-3 font-mono text-xs text-muted">{track.position}</span>
                  {track.title}
                </span>
                {track.duration && (
                  <span className="font-mono text-xs text-muted">{track.duration}</span>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {similar.length > 0 && (
        <section className="relative left-1/2 mt-8 w-screen max-w-[100vw] -translate-x-1/2">
          <CarouselRow title="More like this" items={similar} rowIndex={0} />
        </section>
      )}

      {/* Mobile sticky action bar */}
      <div className="mobile-action-bar fixed bottom-0 left-0 right-0 z-40 p-3 md:hidden">
        <AlbumActions
          discogsReleaseId={releaseId}
          title={release.title}
          artist={release.artist}
          coverUrl={release.coverUrl}
          year={release.year}
          creditCost={creditCost}
          lowestPriceUsd={marketplace?.lowestPrice ?? null}
          numForSale={marketplace?.numForSale ?? 0}
          signedIn={!!session?.user}
          discogsUrl={discogsUrl}
          spotifyUrl={spotifyUrl}
          inWishlist={inWishlist}
          forSale={!!forSale}
          compact
        />
      </div>

      <div className="h-20 md:hidden" />
    </div>
  );
}
