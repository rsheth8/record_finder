import Link from "next/link";
import { auth, isSpotifyConfigured } from "@/lib/auth";
import { CarouselRow } from "@/components/discover/carousel-row";
import { SpotifyConnect } from "@/components/spotify-connect";
import { SpotifySync } from "@/components/spotify-sync";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getCachedRecommendations } from "@/lib/db/queries";
import { getCurrentUserId } from "@/lib/identity";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { Compass, ClipboardList } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await auth();
  const userId = await getCurrentUserId();
  const profile = userId ? await getTasteProfile(userId) : null;
  const recommendations = userId
    ? ((await getCachedRecommendations(userId)) ?? [])
    : [];
  const topPicks = [...recommendations]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  const quizDone = !!profile?.completedAt;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50">
          Find albums worth spinning
        </h1>
        <p className="max-w-2xl text-zinc-400">
          Discover full albums on vinyl before you buy — every pick is confirmed to
          exist as a real pressing on Discogs. Take a 2-minute taste quiz to get
          started; no account needed. Connect Spotify anytime for picks tuned to
          your listening.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={quizDone ? "/discover" : "/quiz"}>
            <Button>{quizDone ? "Browse your picks" : "Take the taste quiz"}</Button>
          </Link>
          <SpotifyConnect spotifyConfigured={isSpotifyConfigured} />
        </div>
        <SpotifySync />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-violet-400" />
            Taste Quiz
          </CardTitle>
          <CardDescription className="mt-2">
            {quizDone
              ? "Quiz complete — retake anytime to refine picks."
              : "Start here: 5 quick questions about genres, eras, and how you listen. No sign-in required."}
          </CardDescription>
          <Link href="/quiz" className="mt-4 inline-block">
            <Button variant="outline">
              {quizDone ? "Retake Quiz" : "Start Quiz"}
            </Button>
          </Link>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-violet-400" />
            Discover
          </CardTitle>
          <CardDescription className="mt-2">
            {quizDone
              ? "Browse your personalized vinyl recommendations."
              : "Complete the quiz first to unlock recommendations."}
          </CardDescription>
          <Link href="/discover" className="mt-4 inline-block">
            <Button disabled={!quizDone}>Browse Picks</Button>
          </Link>
        </Card>
      </section>

      {session?.accessToken ? (
        <p className="text-sm text-emerald-400">
          Spotify connected — recommendations will use your listening history.
        </p>
      ) : quizDone ? (
        <p className="text-sm text-zinc-500">
          Want sharper picks? Connect Spotify above to blend in your listening
          history and save your wishlist across devices.
        </p>
      ) : null}

      {topPicks.length > 0 && (
        <section className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2">
          <div className="mb-3 flex items-center justify-between px-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
            <h2 className="text-xl font-semibold">Top picks for you</h2>
            <Link href="/discover" className="text-sm text-violet-400 hover:underline">
              View all
            </Link>
          </div>
          <CarouselRow title="" items={topPicks} bleed />
        </section>
      )}
    </div>
  );
}
