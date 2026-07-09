import { notFound } from "next/navigation";
import { getRelease } from "@/lib/discogs/client";
import {
  isInWishlist,
  getReleaseFeedback,
  getCachedRecommendations,
  getReservationCountForRelease,
  logEvent,
} from "@/lib/db/queries";
import { AlbumDetail } from "@/components/album/album-detail";
import { auth } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/identity";
import { searchSpotifyAlbum } from "@/lib/spotify/client";
import type { FeedbackSignal } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AlbumPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ src?: string }>;
}) {
  const { id } = await params;
  const releaseId = parseInt(id, 10);
  if (isNaN(releaseId)) notFound();

  const { src } = await searchParams;

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
  // Public info, not gated on sign-in — how many collectors have reserved a
  // concierge spot for this release so far.
  const reservationCount = await getReservationCountForRelease(releaseId).catch(
    () => 0,
  );
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

    if (src === "price-drop-email") {
      await logEvent(userId, "price_drop_email_click", { discogsReleaseId: releaseId });
    }
  }

  // Transparency: if this release is in the visitor's current picks, surface the
  // reasons it was recommended (and whether it was flagged as good value).
  // "More like this" is fetched inside AlbumDetail, behind a Suspense
  // boundary, so its (slower, fully-enriched) fetch doesn't block this page's
  // initial render.
  const cachedRec = (cachedRecs ?? []).find((r) => r.discogsReleaseId === releaseId);
  const recReasons = cachedRec?.reasons ?? [];
  const fairValue = cachedRec?.fairValue ?? false;

  return (
    <AlbumDetail
      release={release}
      spotifyUrl={spotifyUrl}
      inWishlist={inWishlist}
      feedbackSignal={feedbackSignal}
      recReasons={recReasons}
      fairValue={fairValue}
      reservationCount={reservationCount}
      userId={userId}
      signedIn={!!session?.user}
    />
  );
}
