import { QuizFlow } from "@/components/quiz/quiz-flow";
import { getTasteProfile } from "@/lib/db/queries";

export default function QuizPage() {
  const profile = getTasteProfile();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Taste Quiz</h1>
        <p className="mt-2 text-zinc-400">
          Help us understand what you want on vinyl — not just singles, but full
          albums that reward a sit-down listen.
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
