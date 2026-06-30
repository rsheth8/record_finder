import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRelease } from "@/lib/discogs/client";
import { isInWishlist } from "@/lib/db/queries";
import { WishlistButton } from "@/components/album/wishlist-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { searchSpotifyAlbum } from "@/lib/spotify/client";
import { ExternalLink, ArrowLeft } from "lucide-react";

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

  const inWishlist = isInWishlist(releaseId);

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

          <div className="flex flex-wrap gap-3">
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
        </div>
      </div>

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
    </div>
  );
}
