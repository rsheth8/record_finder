import Link from "next/link";
import { auth, isSpotifyConfigured } from "@/lib/auth";
import { SpotifyConnect } from "@/components/spotify-connect";
import { SpotifySync } from "@/components/spotify-sync";
import { RecommendationList } from "@/components/discover/recommendation-card";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getCachedRecommendations } from "@/lib/db/queries";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { Compass, ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  const profile = await getTasteProfile();
  const recommendations = getCachedRecommendations() ?? [];
  const topPicks = recommendations.slice(0, 5);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
          Find albums worth spinning
        </h1>
        <p className="max-w-2xl text-zinc-400">
          Discover full albums on vinyl before you buy. Tell us your taste, connect
          Spotify, and get recommendations with pressing info from Discogs.
        </p>
        <SpotifyConnect spotifyConfigured={isSpotifyConfigured} />
        <SpotifySync />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-violet-400" />
            Taste Quiz
          </CardTitle>
          <CardDescription className="mt-2">
            {profile?.completedAt
              ? "Quiz complete — retake anytime to refine picks."
              : "Start here: 5 quick questions about genres, eras, and how you listen."}
          </CardDescription>
          <Link href="/quiz" className="mt-4 inline-block">
            <Button variant="outline">
              {profile?.completedAt ? "Retake Quiz" : "Start Quiz"}
            </Button>
          </Link>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-violet-400" />
            Discover
          </CardTitle>
          <CardDescription className="mt-2">
            {profile?.completedAt
              ? "Browse your personalized vinyl recommendations."
              : "Complete the quiz first to unlock recommendations."}
          </CardDescription>
          <Link href="/discover" className="mt-4 inline-block">
            <Button disabled={!profile?.completedAt}>Browse Picks</Button>
          </Link>
        </Card>
      </section>

      {session?.accessToken && (
        <p className="text-sm text-emerald-400">
          Spotify connected — recommendations will use your listening history.
        </p>
      )}

      {topPicks.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Top picks for you</h2>
            <Link href="/discover" className="text-sm text-violet-400 hover:underline">
              View all
            </Link>
          </div>
          <RecommendationList recommendations={topPicks} />
        </section>
      )}
    </div>
  );
}
