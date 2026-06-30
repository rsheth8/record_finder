"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const STEPS = [
  "genres",
  "decades",
  "moods",
  "albumPreference",
  "deepCut",
] as const;

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
              "rounded-full border px-4 py-2 text-sm transition-colors",
              active
                ? "border-violet-500 bg-violet-600/20 text-violet-200"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
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

  const step = STEPS[stepIndex];
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  async function save(completed: boolean) {
    setSaving(true);
    await fetch("/api/quiz", {
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
    setSaving(false);
  }

  async function next() {
    await save(false);
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    }
  }

  async function finish() {
    await save(true);
    router.push("/discover");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between text-sm text-zinc-400">
          <span>Step {stepIndex + 1} of {STEPS.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-violet-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <Card>
        {step === "genres" && (
          <>
            <CardTitle>What genres do you reach for?</CardTitle>
            <CardDescription className="mt-2 mb-4">
              Pick up to 6 genres you want more vinyl recommendations in.
            </CardDescription>
            <ToggleGrid options={QUIZ_GENRES} selected={genres} onChange={setGenres} max={6} />
          </>
        )}

        {step === "decades" && (
          <>
            <CardTitle>Which eras speak to you?</CardTitle>
            <CardDescription className="mt-2 mb-4">
              Vinyl shops skew older — tell us which decades you are curious about.
            </CardDescription>
            <ToggleGrid options={QUIZ_DECADES} selected={decades} onChange={setDecades} max={4} />
          </>
        )}

        {step === "moods" && (
          <>
            <CardTitle>What mood are you usually chasing?</CardTitle>
            <CardDescription className="mt-2 mb-4">
              Full albums hit different — pick the vibes you want on the turntable.
            </CardDescription>
            <ToggleGrid options={QUIZ_MOODS} selected={moods} onChange={setMoods} max={4} />
          </>
        )}

        {step === "albumPreference" && (
          <>
            <CardTitle>How do you listen?</CardTitle>
            <CardDescription className="mt-2 mb-4">
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
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    albumPreference === value
                      ? "border-violet-500 bg-violet-600/10"
                      : "border-zinc-700 hover:border-zinc-500",
                  )}
                >
                  <div className="font-medium text-zinc-100">{label}</div>
                  <div className="text-sm text-zinc-400">{desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "deepCut" && (
          <>
            <CardTitle>Mainstream or deep cuts?</CardTitle>
            <CardDescription className="mt-2 mb-4">
              Slide left for classics everyone knows, right for lesser-known pressings.
            </CardDescription>
            <input
              type="range"
              min={0}
              max={100}
              value={deepCutLevel}
              onChange={(e) => setDeepCutLevel(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="mt-2 flex justify-between text-sm text-zinc-400">
              <span>Classic picks</span>
              <Badge>{deepCutLevel < 35 ? "Popular" : deepCutLevel > 65 ? "Deep cuts" : "Balanced"}</Badge>
              <span>Obscure finds</span>
            </div>
          </>
        )}
      </Card>

      <div className="flex justify-between">
        <Button
          variant="ghost"
          disabled={stepIndex === 0 || saving}
          onClick={() => setStepIndex(stepIndex - 1)}
        >
          Back
        </Button>
        {stepIndex < STEPS.length - 1 ? (
          <Button onClick={next} disabled={saving}>
            Continue
          </Button>
        ) : (
          <Button onClick={finish} disabled={saving}>
            {saving ? "Saving..." : "Finish & Discover"}
          </Button>
        )}
      </div>
    </div>
  );
}
