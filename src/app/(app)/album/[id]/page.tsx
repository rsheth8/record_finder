import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRelease, getSimilarReleases } from "@/lib/discogs/client";
import {
  isInWishlist,
  getReleaseFeedback,
  getCachedRecommendations,
} from "@/lib/db/queries";
import { WishlistButton } from "@/components/album/wishlist-button";
import { FeedbackButtons } from "@/components/album/feedback-buttons";
import { CarouselRow } from "@/components/discover/carousel-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/identity";
import { searchSpotifyAlbum } from "@/lib/spotify/client";
import { usdToCredits, formatUsd } from "@/lib/commerce/pricing";
import { ReserveWithCreditsButton } from "@/components/album/reserve-with-credits-button";
import { ExternalLink, ArrowLeft } from "lucide-react";

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

  const inWishlist = session?.user?.id
    ? await isInWishlist(session.user.id, releaseId)
    : false;
  const feedbackSignal = session?.user?.id
    ? await getReleaseFeedback(session.user.id, releaseId)
    : null;
  const marketplace = release.marketplace;
  const creditCost = usdToCredits(marketplace?.lowestPrice ?? 5);

  // Transparency: if this release is in the visitor's current picks, surface the
  // reasons it was recommended. And a cheap "more like this" row by style/genre.
  const userId = await getCurrentUserId();
  const cachedRecs = userId ? (await getCachedRecommendations(userId)) ?? [] : [];
  const recReasons =
    cachedRecs.find((r) => r.discogsReleaseId === releaseId)?.reasons ?? [];
  const similar = await getSimilarReleases(release).catch(() => []);

  return (
    <div className="space-y-8">
      <Link
        href="/discover"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Discover
      </Link>

      <div className="flex flex-col gap-8 md:flex-row">
        <div className="relative mx-auto h-64 w-64 shrink-0 overflow-hidden rounded-xl bg-zinc-800 md:mx-0">
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
            <div className="flex h-full items-center justify-center text-zinc-500">
              No cover art
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-50">{release.title}</h1>
            <p className="mt-1 text-lg text-zinc-400">
              {release.artist}
              {release.year ? ` · ${release.year}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {[...release.genres, ...release.styles].slice(0, 6).map((g) => (
              <Badge key={g}>{g}</Badge>
            ))}
          </div>

          {release.communityRating && (
            <p className="text-sm text-zinc-400">
              Discogs rating: {release.communityRating.toFixed(1)}/5
              {release.ratingCount ? ` (${release.ratingCount} ratings)` : ""}
            </p>
          )}

          {marketplace && marketplace.numForSale > 0 && (
            <p className="text-sm text-violet-300">
              From {marketplace.lowestPrice ? formatUsd(marketplace.lowestPrice) : "—"} ·{" "}
              {marketplace.numForSale} cop{marketplace.numForSale === 1 ? "y" : "ies"} for sale
            </p>
          )}

          <div className="flex flex-wrap items-start gap-3">
            <ReserveWithCreditsButton
              discogsReleaseId={releaseId}
              title={release.title}
              artist={release.artist}
              creditCost={creditCost}
              lowestPriceUsd={marketplace?.lowestPrice ?? null}
              numForSale={marketplace?.numForSale ?? 0}
              signedIn={!!session?.user}
            />
            <WishlistButton
              discogsReleaseId={releaseId}
              title={release.title}
              artist={release.artist}
              coverUrl={release.coverUrl}
              year={release.year}
              initialInWishlist={inWishlist}
            />
            {spotifyUrl && (
              <a
                href={spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-200 hover:bg-zinc-900"
              >
                <ExternalLink className="h-4 w-4" />
                Listen on Spotify
              </a>
            )}
          </div>

          <div className="space-y-2 border-t border-zinc-800 pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Tune your recommendations
            </p>
            <FeedbackButtons
              discogsReleaseId={releaseId}
              artist={release.artist}
              initialSignal={feedbackSignal}
            />
          </div>
        </div>
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
        <Card>
          <CardTitle>Pressing info</CardTitle>
          <CardDescription className="mt-2">
            {release.formats.join(" · ")}
          </CardDescription>
        </Card>
      )}

      {release.tracklist.length > 0 && (
        <Card>
          <CardTitle>Tracklist</CardTitle>
          <ol className="mt-4 space-y-1">
            {release.tracklist.map((track) => (
              <li
                key={`${track.position}-${track.title}`}
                className="flex justify-between text-sm text-zinc-300"
              >
                <span>
                  <span className="mr-3 text-zinc-500">{track.position}</span>
                  {track.title}
                </span>
                {track.duration && (
                  <span className="text-zinc-500">{track.duration}</span>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {similar.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-100">More like this</h2>
          <CarouselRow title="" items={similar} bleed={false} />
        </section>
      )}
    </div>
  );
}
