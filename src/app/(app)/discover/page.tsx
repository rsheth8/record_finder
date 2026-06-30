import Link from "next/link";
import { DiscoverFeed } from "@/components/discover/discover-feed";
import { Button } from "@/components/ui/button";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { loadRecommendations } from "@/lib/recommendations/load";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const profile = await getTasteProfile();

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

  const { recommendations, error } = await loadRecommendations(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Discover</h1>
        <p className="mt-2 text-zinc-400">
          Albums with confirmed vinyl pressings, ranked for your taste.
        </p>
      </div>
      <DiscoverFeed recommendations={recommendations} error={error} />
    </div>
  );
}
