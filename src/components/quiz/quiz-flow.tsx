"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Range } from "@/components/ui/range";
import { VinylProgressRing } from "@/components/ui/progress";
import {
  QUIZ_GENRES,
  QUIZ_DECADES,
  QUIZ_MOODS,
  type AlbumPreference,
  type QuizDecade,
  type QuizGenre,
  type QuizMood,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import {
  Calendar,
  CheckCircle2,
  Headphones,
  Music2,
  Sparkles,
  Waves,
} from "lucide-react";

const STEPS = [
  "genres",
  "decades",
  "moods",
  "albumPreference",
  "deepCut",
] as const;

const STEP_META = {
  genres: { icon: Music2, label: "Genres" },
  decades: { icon: Calendar, label: "Eras" },
  moods: { icon: Waves, label: "Moods" },
  albumPreference: { icon: Headphones, label: "Listening" },
  deepCut: { icon: Sparkles, label: "Discovery" },
} as const;

function ToggleGrid<T extends string>({
  options,
  selected,
  onChange,
  max,
}: {
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
  max?: number;
}) {
  function toggle(option: T) {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
      return;
    }
    if (max && selected.length >= max) return;
    onChange([...selected, option]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className={cn(
              "rounded-full border px-4 py-2.5 text-sm transition-colors",
              active
                ? "border-accent bg-accent-muted text-accent"
                : "border-border text-muted hover:border-accent/50 hover:text-foreground",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function QuizFlow({ initial }: { initial?: {
  genres: QuizGenre[];
  decades: QuizDecade[];
  moods: QuizMood[];
  albumPreference: AlbumPreference;
  deepCutLevel: number;
} | null }) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [genres, setGenres] = useState<QuizGenre[]>(initial?.genres ?? []);
  const [decades, setDecades] = useState<QuizDecade[]>(initial?.decades ?? []);
  const [moods, setMoods] = useState<QuizMood[]>(initial?.moods ?? []);
  const [albumPreference, setAlbumPreference] = useState<AlbumPreference>(
    initial?.albumPreference ?? "balanced",
  );
  const [deepCutLevel, setDeepCutLevel] = useState(initial?.deepCutLevel ?? 50);
  const [saving, setSaving] = useState(false);
  const [navigatingToDiscover, setNavigatingToDiscover] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;
  const StepIcon = STEP_META[step].icon;

  async function save(completed: boolean): Promise<boolean> {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genres,
          decades,
          moods,
          albumPreference,
          deepCutLevel,
          completed,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save quiz progress");
      }

      return true;
    } catch {
      setError("Could not save your answers. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    const ok = await save(false);
    if (!ok) return;

    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    }
  }

  async function finish() {
    const ok = await save(true);
    if (!ok) return;

    setCelebrating(true);
    await new Promise((r) => setTimeout(r, 1800));
    setNavigatingToDiscover(true);
    router.push("/discover");
    router.refresh();
  }

  if (celebrating && !navigatingToDiscover) {
    return (
      <div className="quiz-celebrate flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <CheckCircle2 className="h-16 w-16 text-success" />
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground">Taste profile saved!</h2>
          <p className="mt-2 text-muted">Spinning up your personalized picks...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {navigatingToDiscover && (
        <VinylLoader variant="overlay" context="quiz" />
      )}
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <VinylProgressRing value={progress} size={100} />
            <div className="absolute inset-0 flex items-center justify-center">
              <StepIcon className="h-8 w-8 text-accent" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted">
              Step {stepIndex + 1} of {STEPS.length} · {STEP_META[step].label}
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-foreground">
              {Math.round(progress)}% complete
            </p>
          </div>
          <div className="flex gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 w-8 rounded-full transition-colors",
                  i <= stepIndex ? "bg-accent" : "bg-surface-elevated",
                )}
              />
            ))}
          </div>
        </div>

        <Card className="animate-in fade-in duration-300 noir-glass">
          {step === "genres" && (
            <>
              <CardTitle>What genres do you reach for?</CardTitle>
              <CardDescription className="mt-2 mb-6">
                Pick up to 6 genres you want more vinyl recommendations in.
              </CardDescription>
              <ToggleGrid options={QUIZ_GENRES} selected={genres} onChange={setGenres} max={6} />
            </>
          )}

          {step === "decades" && (
            <>
              <CardTitle>Which eras speak to you?</CardTitle>
              <CardDescription className="mt-2 mb-6">
                Vinyl shops skew older — tell us which decades you are curious about.
              </CardDescription>
              <ToggleGrid options={QUIZ_DECADES} selected={decades} onChange={setDecades} max={4} />
            </>
          )}

          {step === "moods" && (
            <>
              <CardTitle>What mood are you usually chasing?</CardTitle>
              <CardDescription className="mt-2 mb-6">
                Full albums hit different — pick the vibes you want on the turntable.
              </CardDescription>
              <ToggleGrid options={QUIZ_MOODS} selected={moods} onChange={setMoods} max={4} />
            </>
          )}

          {step === "albumPreference" && (
            <>
              <CardTitle>How do you listen?</CardTitle>
              <CardDescription className="mt-2 mb-6">
                This helps us suggest albums that reward a full sit-down listen.
              </CardDescription>
              <div className="space-y-3">
                {(
                  [
                    ["singles", "Mostly singles & playlists", "I jump around a lot"],
                    ["balanced", "A mix of both", "I like albums but still shuffle sometimes"],
                    ["full_albums", "Full album listener", "I want immersive records front to back"],
                  ] as const
                ).map(([value, label, desc]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setAlbumPreference(value)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition-colors",
                      albumPreference === value
                        ? "border-accent bg-accent-muted"
                        : "border-border hover:border-accent/50",
                    )}
                  >
                    <div className="font-medium text-foreground">{label}</div>
                    <div className="text-sm text-muted">{desc}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "deepCut" && (
            <>
              <CardTitle>Mainstream or deep cuts?</CardTitle>
              <CardDescription className="mt-2 mb-6">
                Slide left for classics everyone knows, right for lesser-known pressings.
              </CardDescription>
              <input
                type="range"
                min={0}
                max={100}
                value={deepCutLevel}
                onChange={(e) => setDeepCutLevel(Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="mt-3 flex justify-between text-sm text-muted">
                <span>Classic picks</span>
                <Badge variant="accent">
                  {deepCutLevel < 35 ? "Popular" : deepCutLevel > 65 ? "Deep cuts" : "Balanced"}
                </Badge>
                <span>Obscure finds</span>
              </div>
            </>
          )}
        </Card>

        {error && (
          <p className="text-sm text-error">{error}</p>
        )}

        <div className="flex justify-between pb-8">
          <Button
            variant="ghost"
            disabled={stepIndex === 0 || saving}
            onClick={() => setStepIndex(stepIndex - 1)}
          >
            Back
          </Button>
          {stepIndex < STEPS.length - 1 ? (
            <Button onClick={next} disabled={saving} size="lg">
              Continue
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving} size="lg">
              {saving ? "Saving..." : "Finish & Discover"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
