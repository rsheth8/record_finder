import { QuizFlow } from "@/components/quiz/quiz-flow";
import { getCurrentUserId } from "@/lib/identity";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { getQuizResponses } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function QuizPage() {
  const userId = await getCurrentUserId();
  const [profile, responses] = userId
    ? await Promise.all([getTasteProfile(userId), getQuizResponses(userId)])
    : [null, null];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Taste Quiz</h1>
        <p className="mt-2 text-muted">
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
                subGenres: responses?.subGenres ?? {},
                albumPreferences: responses?.albumPreferences ?? [],
              }
            : null
        }
      />
    </div>
  );
}
