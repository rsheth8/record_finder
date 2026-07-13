import Link from "next/link";
import { Coins, Heart, RefreshCw } from "lucide-react";
import { auth, isSpotifyConfigured } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/identity";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { getWishlist, getCreditBalance, getSpotifySnapshot } from "@/lib/db/queries";
import { SpotifyConnect } from "@/components/spotify-connect";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AlbumPreference, FormatPreference } from "@/lib/types";

export const dynamic = "force-dynamic";

const ALBUM_PREFERENCE_LABELS: Record<AlbumPreference, string> = {
  singles: "Singles listener",
  balanced: "Balanced",
  full_albums: "Full album listener",
};

const FORMAT_PREFERENCE_LABELS: Record<FormatPreference, string> = {
  originals: "Original pressings only",
  either: "Originals or reissues",
  reissues: "Reissues are great",
};

export default async function ProfilePage() {
  const session = await auth();
  const userId = await getCurrentUserId();
  const profile = userId ? await getTasteProfile(userId) : null;

  const isSignedIn = !!session?.user?.id;
  const [wishlist, creditBalance, snapshot] = isSignedIn
    ? await Promise.all([
        getWishlist(session!.user.id),
        getCreditBalance(session!.user.id),
        getSpotifySnapshot(session!.user.id),
      ])
    : [[], 0, null];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Profile</h1>
        <p className="mt-2 text-muted">
          {isSignedIn
            ? "Your taste profile and account."
            : "Your taste profile, saved to this browser. Connect Spotify to keep it across devices."}
        </p>
      </div>

      <Card>
        <CardTitle>Account</CardTitle>
        <div className="mt-3">
          <SpotifyConnect spotifyConfigured={isSpotifyConfigured} />
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Taste profile</CardTitle>
          <Link href="/quiz">
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Retake quiz
            </Button>
          </Link>
        </div>

        {!profile?.completedAt ? (
          <p className="mt-3 text-sm text-muted">
            You haven&rsquo;t taken the quiz yet.{" "}
            <Link href="/quiz" className="text-accent hover:underline">
              Take it now
            </Link>{" "}
            to get personalized picks.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {profile.genres.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Genres
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {profile.genres.map((g) => (
                    <Badge key={g}>{g}</Badge>
                  ))}
                </div>
              </div>
            )}
            {profile.decades.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Decades
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {profile.decades.map((d) => (
                    <Badge key={d}>{d}</Badge>
                  ))}
                </div>
              </div>
            )}
            {profile.moods.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Moods
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {profile.moods.map((m) => (
                    <Badge key={m}>{m}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
              <span>
                Listening style:{" "}
                <span className="text-foreground">
                  {ALBUM_PREFERENCE_LABELS[profile.albumPreference]}
                </span>
              </span>
              <span>
                Pressings:{" "}
                <span className="text-foreground">
                  {FORMAT_PREFERENCE_LABELS[profile.formatPreference]}
                </span>
              </span>
              <span>
                Deep-cut appetite:{" "}
                <span className="text-foreground">{profile.deepCutLevel}/100</span>
              </span>
            </div>
          </div>
        )}
      </Card>

      {isSignedIn && snapshot && (
        <Card>
          <CardTitle>Spotify listening</CardTitle>
          <p className="mt-2 text-sm text-muted">
            Last synced {snapshot.fetchedAt.toLocaleDateString()} —{" "}
            {snapshot.savedAlbums.length} saved albums
            {snapshot.playlistTracks.length > 0 &&
              `, ${snapshot.playlistTracks.length} playlist tracks`}{" "}
            analyzed.
          </p>
        </Card>
      )}

      {isSignedIn && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/wishlist">
            <Card className="transition-colors hover:border-accent/40">
              <div className="flex items-center gap-3">
                <Heart className="h-5 w-5 text-accent" />
                <div>
                  <p className="font-display text-lg font-semibold text-foreground">
                    {wishlist.length}
                  </p>
                  <p className="text-sm text-muted">Wishlist items</p>
                </div>
              </div>
            </Card>
          </Link>
          <Link href="/credits">
            <Card className="transition-colors hover:border-accent/40">
              <div className="flex items-center gap-3">
                <Coins className="h-5 w-5 text-accent" />
                <div>
                  <p className="font-display text-lg font-semibold text-foreground">
                    {creditBalance}
                  </p>
                  <p className="text-sm text-muted">Credits</p>
                </div>
              </div>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
