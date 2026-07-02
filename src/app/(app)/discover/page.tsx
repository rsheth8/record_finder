import Link from "next/link";
import { DiscoverFeed } from "@/components/discover/discover-feed";
import { Button } from "@/components/ui/button";
import { SignInPrompt } from "@/components/auth/sign-in-prompt";
import { auth } from "@/lib/auth";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { loadRecommendations } from "@/lib/recommendations/load";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <SignInPrompt
        title="Connect Spotify to see recommendations"
        description="Sign in to get vinyl picks tailored to your taste."
      />
    );
  }

  const profile = await getTasteProfile(session.user.id);

  if (!profile?.completedAt) {
    return (
      <div className="space-y-4 text-center py-20">
        <h1 className="text-2xl font-bold">Complete the quiz first</h1>
        <p className="text-zinc-400">
          We need to know your taste before we can recommend albums.
        </p>
        <Link href="/quiz">
          <Button>Take the Quiz</Button>
        </Link>
      </div>
    );
  }

  const { recommendations, error, degraded } = await loadRecommendations(
    session.user.id,
    false,
  );

  return (
    <div className="space-y-2">
      <div className="px-4 sm:px-0">
        <h1 className="text-2xl font-bold text-zinc-50 sm:text-3xl">Discover</h1>
        <p className="mt-2 max-w-2xl text-zinc-400">
          Albums with confirmed vinyl pressings, ranked for your taste. Search, filter,
          and browse by genre or era.
        </p>
      </div>
      <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 pt-2">
        <DiscoverFeed
          recommendations={recommendations}
          quizGenres={profile.genres}
          quizDecades={profile.decades}
          error={error}
          degraded={degraded}
        />
      </div>
    </div>
  );
}
