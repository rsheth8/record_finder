import { QuizFlow } from "@/components/quiz/quiz-flow";
import { getCurrentUserId } from "@/lib/identity";
import { getTasteProfile } from "@/lib/taste-profile-store";

export const dynamic = "force-dynamic";

export default async function QuizPage() {
  const userId = await getCurrentUserId();
  const profile = userId ? await getTasteProfile(userId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Taste Quiz</h1>
        <p className="mt-2 text-zinc-400">
          Help us understand what you want on vinyl — not just singles, but full
          albums that reward a sit-down listen. No account needed to start.
        </p>
      </div>
      <QuizFlow
        initial={
          profile
            ? {
                genres: profile.genres,
                decades: profile.decades,
                moods: profile.moods,
                albumPreference: profile.albumPreference,
                deepCutLevel: profile.deepCutLevel,
              }
            : null
        }
      />
    </div>
  );
}
