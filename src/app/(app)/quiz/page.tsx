import { QuizFlow, QUIZ_STEPS } from "@/components/quiz/quiz-flow";
import { getCurrentUserId } from "@/lib/identity";
import { getTasteProfile } from "@/lib/taste-profile-store";
import { getQuizResponses, getSpotifySnapshot } from "@/lib/db/queries";
import { buildSpotifyQuizPool } from "@/lib/quiz/spotify-pool";

export const dynamic = "force-dynamic";

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step } = await searchParams;
  const userId = await getCurrentUserId();
  const [profile, responses, snapshot] = userId
    ? await Promise.all([
        getTasteProfile(userId),
        getQuizResponses(userId),
        getSpotifySnapshot(userId),
      ])
    : [null, null, null];

  const initialStepIndex = step ? QUIZ_STEPS.indexOf(step as (typeof QUIZ_STEPS)[number]) : -1;
  const initialSpotifyPool = snapshot ? buildSpotifyQuizPool(snapshot) : null;

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
                formatPreference: profile.formatPreference,
                deepCutLevel: profile.deepCutLevel,
                experienceLevel: profile.experienceLevel,
                birthDecade: profile.birthDecade,
                subGenres: responses?.subGenres ?? {},
                albumPreferences: responses?.albumPreferences ?? [],
                recognizedArtists: responses?.recognizedArtists ?? { owned: [], seenLive: [] },
              }
            : null
        }
        initialStepIndex={initialStepIndex >= 0 ? initialStepIndex : 0}
        initialSpotifyPool={initialSpotifyPool}
      />
    </div>
  );
}
