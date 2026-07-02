import Link from "next/link";
import { auth, isSpotifyConfigured } from "@/lib/auth";
import { CarouselRow } from "@/components/discover/carousel-row";
import { NoirHero } from "@/components/home/noir-hero";
import { SpotifyConnect } from "@/components/spotify-connect";
import { SpotifySync } from "@/components/spotify-sync";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { StaggerContainer, StaggerItem } from "@/components/motion/stagger";
import { getCachedRecommendations } from "@/lib/db/queries";
import { getCurrentUserId } from "@/lib/identity";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { CheckCircle2, Circle, Compass, ClipboardList } from "lucide-react";

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
  const spotifyConnected = !!session?.accessToken;

  const primaryCta = !quizDone
    ? { href: "/quiz", label: "Start Taste Quiz" }
    : !spotifyConnected
      ? { href: "#spotify", label: "Connect Spotify" }
      : { href: "/discover", label: "Browse Your Picks" };

  const coverUrls = topPicks
    .map((r) => r.coverUrl)
    .filter((url): url is string => !!url);

  return (
    <div className="space-y-10">
      <NoirHero
        title="Find albums worth spinning"
        subtitle="Discover full albums on vinyl before you buy — every pick is confirmed as a real pressing on Discogs. Start with the taste quiz (no account needed). Connect Spotify anytime for sharper picks."
        primaryCta={primaryCta}
        showSecondary={quizDone}
        coverUrls={coverUrls}
      />

      <StaggerContainer>
        <StaggerItem>
          <Card className="noir-glass">
            <CardTitle>Your journey</CardTitle>
            <CardDescription className="mt-2 mb-6">
              Three steps to personalized vinyl picks
            </CardDescription>
            <ol className="space-y-4">
              <li className="flex items-start gap-4">
                {quizDone ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-accent" />
                    <p className="font-medium text-foreground">Take the taste quiz</p>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {quizDone
                      ? "Complete — retake anytime to refine picks."
                      : "5 quick questions about genres, eras, and how you listen. No sign-in required."}
                  </p>
                  {!quizDone && (
                    <Link href="/quiz" className="mt-3 inline-block">
                      <Button variant="outline" size="sm">Start Quiz</Button>
                    </Link>
                  )}
                </div>
              </li>
              <li className="flex items-start gap-4">
                {spotifyConnected ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                )}
                <div className="flex-1" id="spotify">
                  <p className="font-medium text-foreground">Connect Spotify</p>
                  <p className="mt-1 text-sm text-muted">
                    Optional — improves recommendations and unlocks free credits.
                  </p>
                  <div className="mt-3 space-y-2">
                    <SpotifyConnect spotifyConfigured={isSpotifyConfigured} />
                    <SpotifySync />
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-4">
                {quizDone ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Compass className="h-4 w-4 text-accent" />
                    <p className="font-medium text-foreground">Browse your picks</p>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    Scroll curated rows of vinyl matched to your taste.
                  </p>
                  {quizDone && (
                    <Link href="/discover" className="mt-3 inline-block">
                      <Button size="sm">Browse Picks</Button>
                    </Link>
                  )}
                </div>
              </li>
            </ol>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {spotifyConnected ? (
        <p className="text-sm text-success">
          Spotify connected — recommendations use your listening history.
        </p>
      ) : quizDone ? (
        <p className="text-sm text-muted">
          Want sharper picks? Connect Spotify above to blend in your listening
          history and save your wishlist across devices.
        </p>
      ) : null}

      {topPicks.length > 0 && (
        <section className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2">
          <div className="mb-3 flex items-center justify-between px-4 sm:px-[max(1rem,calc((100vw-72rem)/2+1rem))]">
            <h2 className="font-display text-xl font-semibold">Top picks for you</h2>
            <Link href="/discover" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
          <CarouselRow title="" items={topPicks} bleed featured rowIndex={0} />
        </section>
      )}
    </div>
  );
}
