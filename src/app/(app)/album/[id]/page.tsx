import { notFound } from "next/navigation";
import { getRelease, getSimilarReleases } from "@/lib/discogs/client";
import {
  isInWishlist,
  getReleaseFeedback,
  getCachedRecommendations,
} from "@/lib/db/queries";
import { AlbumDetail } from "@/components/album/album-detail";
import { auth } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/identity";
import { searchSpotifyAlbum } from "@/lib/spotify/client";
import type { FeedbackSignal } from "@/lib/types";

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
  let inWishlist = false;
  let feedbackSignal: FeedbackSignal | null = null;
  let cachedRecs: Awaited<ReturnType<typeof getCachedRecommendations>> = [];

  if (userId) {
    try {
      [inWishlist, feedbackSignal, cachedRecs] = await Promise.all([
        isInWishlist(userId, releaseId),
        getReleaseFeedback(userId, releaseId),
        getCachedRecommendations(userId),
      ]);
    } catch (error) {
      console.error("[album] profile lookups failed:", error);
    }
  }

  // Transparency: if this release is in the visitor's current picks, surface the
  // reasons it was recommended. And a cheap "more like this" row by style/genre.
  const recReasons =
    (cachedRecs ?? []).find((r) => r.discogsReleaseId === releaseId)?.reasons ?? [];
  const similar = await getSimilarReleases(release).catch(() => []);

  return (
    <AlbumDetail
      release={release}
      spotifyUrl={spotifyUrl}
      inWishlist={inWishlist}
      feedbackSignal={feedbackSignal}
      recReasons={recReasons}
      similar={similar}
      userId={userId}
      signedIn={!!session?.user}
    />
  );
}
