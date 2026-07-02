import Link from "next/link";
import { DiscoverFeed } from "@/components/discover/discover-feed";
import { Button } from "@/components/ui/button";
import { getCurrentUserId } from "@/lib/identity";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { getCachedRecommendations } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const userId = await getCurrentUserId();
  const profile = userId ? await getTasteProfile(userId) : null;

  if (!profile?.completedAt) {
    return (
      <div className="space-y-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Take the quiz first</h1>
        <p className="text-muted">
          We need to know your taste before we can recommend albums. No account
          required — connect Spotify later for picks based on your listening.
        </p>
        <Link href="/quiz">
          <Button>Take the Quiz</Button>
        </Link>
      </div>
    );
  }

  // Read cached picks only — generation (a ~25s serial Discogs pass) is kicked
  // off client-side so it never blocks the page request or trips a serverless
  // function timeout. An empty cache means "not generated yet".
  const cached = (await getCachedRecommendations(userId!)) ?? [];

  return (
    <div className="space-y-2">
      <div className="px-4 sm:px-0">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">Discover</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Scroll curated rows of vinyl matched to your taste, open any album for pressing
          details, then shop listings on Discogs.
        </p>
      </div>
      <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 pt-2">
        <DiscoverFeed
          recommendations={cached}
          quizGenres={profile.genres}
          quizDecades={profile.decades}
          needsGeneration={cached.length === 0}
        />
      </div>
    </div>
  );
}
