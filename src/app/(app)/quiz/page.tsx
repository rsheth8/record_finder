import { QuizFlow } from "@/components/quiz/quiz-flow";
import { SignInPrompt } from "@/components/auth/sign-in-prompt";
import { auth } from "@/lib/auth";
import { getTasteProfile } from "@/lib/taste-profile-store";

export const dynamic = "force-dynamic";

export default async function QuizPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <SignInPrompt
        title="Connect Spotify to start"
        description="We use your Spotify listening history and quiz answers together to build your taste profile."
      />
    );
  }

  const profile = await getTasteProfile(session.user.id);

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
