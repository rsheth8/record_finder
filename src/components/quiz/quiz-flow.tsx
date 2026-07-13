"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Range } from "@/components/ui/range";
import { VinylProgressRing } from "@/components/ui/progress";
import {
  QUIZ_GENRES,
  QUIZ_DECADES,
  QUIZ_MOODS,
  BIRTH_DECADES,
  type AlbumPreference,
  type BirthDecade,
  type ExperienceLevel,
  type FormatPreference,
  type QuizAlbumPreference,
  type QuizDecade,
  type QuizGenre,
  type QuizMood,
  type QuizRecognizedArtists,
  type QuizSubGenres,
} from "@/lib/types";
import { QUIZ_SUB_GENRES } from "@/lib/quiz/sub-genres";
import {
  battleToPreference,
  pickAlbumBattles,
  type AlbumBattlePair,
} from "@/lib/quiz/album-battles";
import { pickRecognizedArtists } from "@/lib/quiz/recognized-artists";
import { buildSpotifyQuizPool, type SpotifyQuizPool } from "@/lib/quiz/spotify-pool";
import { cn } from "@/lib/utils";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import {
  Calendar,
  CheckCircle2,
  Disc3,
  Headphones,
  Music,
  Music2,
  Repeat,
  Sparkles,
  Swords,
  UserRound,
  Users,
  Waves,
} from "lucide-react";

export const QUIZ_STEPS = [
  "genres",
  "background",
  "connectSpotify",
  "subGenres",
  "decades",
  "moods",
  "recognizedArtists",
  "albumBattles",
  "albumPreference",
  "formatPreference",
  "deepCut",
] as const;

const STEP_META = {
  genres: { icon: Music2, label: "Genres" },
  background: { icon: UserRound, label: "About you" },
  connectSpotify: { icon: Music, label: "Spotify" },
  subGenres: { icon: Disc3, label: "Sub-genres" },
  decades: { icon: Calendar, label: "Eras" },
  moods: { icon: Waves, label: "Moods" },
  recognizedArtists: { icon: Users, label: "Artists" },
  albumBattles: { icon: Swords, label: "Album picks" },
  albumPreference: { icon: Headphones, label: "Listening" },
  formatPreference: { icon: Repeat, label: "Pressings" },
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
              "pressable focus-ring rounded-full border px-4 py-2.5 text-sm",
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

function AlbumBattleCard({
  pair,
  selection,
  onSelect,
}: {
  pair: AlbumBattlePair;
  selection: "A" | "B" | null;
  onSelect: (winner: "A" | "B") => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="text-sm text-muted">Which would you rather own on vinyl?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["A", "B"] as const).map((side) => {
          const album = side === "A" ? pair.albumA : pair.albumB;
          const active = selection === side;
          return (
            <button
              key={side}
              type="button"
              onClick={() => onSelect(side)}
              className={cn(
                "pressable focus-ring rounded-xl border p-4 text-left",
                active
                  ? "border-accent bg-accent-muted"
                  : "border-border hover:border-accent/50",
              )}
            >
              <div className="font-medium text-foreground">{album.title}</div>
              <div className="text-sm text-muted">{album.artist}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function QuizFlow({
  initial,
  initialStepIndex = 0,
  initialSpotifyPool = null,
}: {
  initial?: {
    genres: QuizGenre[];
    decades: QuizDecade[];
    moods: QuizMood[];
    albumPreference: AlbumPreference;
    formatPreference?: FormatPreference;
    deepCutLevel: number;
    experienceLevel?: ExperienceLevel;
    birthDecade?: BirthDecade | null;
    subGenres?: QuizSubGenres;
    albumPreferences?: QuizAlbumPreference[];
    recognizedArtists?: QuizRecognizedArtists;
  } | null;
  /** Resume position after a mid-quiz Spotify OAuth redirect — see the
   * `connectSpotify` step. */
  initialStepIndex?: number;
  /** Already-connected Spotify data fetched server-side, so a returning
   * signed-in user (e.g. retaking the quiz from /profile) skips straight to
   * tailored artist/album pools without re-clicking "Connect". */
  initialSpotifyPool?: SpotifyQuizPool | null;
}) {
  const router = useRouter();
  const { status } = useSession();
  const reducedMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(initialStepIndex);
  const [genres, setGenres] = useState<QuizGenre[]>(initial?.genres ?? []);
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    initial?.experienceLevel ?? "casual",
  );
  const [birthDecade, setBirthDecade] = useState<BirthDecade | null>(
    initial?.birthDecade ?? null,
  );
  const [spotifyPool, setSpotifyPool] = useState<SpotifyQuizPool | null>(initialSpotifyPool);
  const [spotifySyncState, setSpotifySyncState] = useState<
    "idle" | "syncing" | "done" | "error"
  >("idle");
  const [subGenres, setSubGenres] = useState<QuizSubGenres>(initial?.subGenres ?? {});
  const [decades, setDecades] = useState<QuizDecade[]>(initial?.decades ?? []);
  const [moods, setMoods] = useState<QuizMood[]>(initial?.moods ?? []);
  const [albumPreference, setAlbumPreference] = useState<AlbumPreference>(
    initial?.albumPreference ?? "balanced",
  );
  const [formatPreference, setFormatPreference] = useState<FormatPreference>(
    initial?.formatPreference ?? "either",
  );
  const [ownedArtists, setOwnedArtists] = useState<string[]>(
    initial?.recognizedArtists?.owned ?? [],
  );
  const [seenLiveArtists, setSeenLiveArtists] = useState<string[]>(
    initial?.recognizedArtists?.seenLive ?? [],
  );
  const [deepCutLevel, setDeepCutLevel] = useState(initial?.deepCutLevel ?? 50);
  const [battleSelections, setBattleSelections] = useState<
    Record<string, "A" | "B">
  >(() => {
    const map: Record<string, "A" | "B"> = {};
    for (const pref of initial?.albumPreferences ?? []) {
      const match = pref.winnerAlbumId.match(/^battle:([^:]+):/);
      if (match) {
        map[match[1]] = pref.winnerAlbumId.endsWith(":A") ? "A" : "B";
      }
    }
    return map;
  });
  const [saving, setSaving] = useState(false);
  const [navigatingToDiscover, setNavigatingToDiscover] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After a mid-quiz Spotify OAuth redirect (or arriving already signed in
  // with no prior snapshot), sync listening data in the background — mirrors
  // SpotifySync's pattern but doesn't block Continue on it. Later steps fall
  // back to the curated pool if this hasn't resolved yet.
  useEffect(() => {
    if (status !== "authenticated" || spotifyPool !== null || spotifySyncState !== "idle") {
      return;
    }
    let cancelled = false;

    async function sync() {
      setSpotifySyncState("syncing");
      try {
        const res = await fetch("/api/spotify/top", { method: "POST" });
        if (cancelled) return;
        if (!res.ok) {
          setSpotifySyncState("error");
          return;
        }
        const data = await res.json();
        setSpotifyPool(buildSpotifyQuizPool(data));
        setSpotifySyncState("done");
      } catch {
        if (!cancelled) setSpotifySyncState("error");
      }
    }

    sync();
    return () => {
      cancelled = true;
    };
  }, [status, spotifyPool, spotifySyncState]);

  const hasSpotifyArtists = (spotifyPool?.topArtists.length ?? 0) > 0;
  const hasSpotifyAlbums = (spotifyPool?.topAlbums.length ?? 0) >= 2;

  const battles = useMemo(() => {
    if (hasSpotifyAlbums) {
      const albums = spotifyPool!.topAlbums;
      const pairs: AlbumBattlePair[] = [];
      for (let i = 0; i + 1 < albums.length && pairs.length < 3; i += 2) {
        pairs.push({
          id: `spotify-${i}`,
          genre: genres[0] ?? "Rock",
          albumA: albums[i],
          albumB: albums[i + 1],
        });
      }
      return pairs;
    }
    return pickAlbumBattles(genres, experienceLevel, 3);
  }, [genres, experienceLevel, hasSpotifyAlbums, spotifyPool]);
  const recognizedArtistPool = useMemo(() => {
    if (hasSpotifyArtists) return spotifyPool!.topArtists.slice(0, 12);
    return pickRecognizedArtists(genres, experienceLevel);
  }, [genres, experienceLevel, hasSpotifyArtists, spotifyPool]);

  const step = QUIZ_STEPS[stepIndex];
  const progress = ((stepIndex + 1) / QUIZ_STEPS.length) * 100;
  const StepIcon = STEP_META[step].icon;

  const albumPreferences = useMemo(
    () =>
      battles
        .filter((pair) => battleSelections[pair.id])
        .map((pair) =>
          battleToPreference(pair, battleSelections[pair.id]!),
        ),
    [battles, battleSelections],
  );

  function toggleOwned(artist: string) {
    setOwnedArtists((prev) =>
      prev.includes(artist) ? prev.filter((a) => a !== artist) : [...prev, artist],
    );
  }

  function toggleSeenLive(artist: string) {
    setSeenLiveArtists((prev) =>
      prev.includes(artist) ? prev.filter((a) => a !== artist) : [...prev, artist],
    );
  }

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
          formatPreference,
          deepCutLevel,
          experienceLevel,
          birthDecade,
          subGenres,
          albumPreferences,
          recognizedArtists: { owned: ownedArtists, seenLive: seenLiveArtists },
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

    if (stepIndex < QUIZ_STEPS.length - 1) {
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
              Step {stepIndex + 1} of {QUIZ_STEPS.length} · {STEP_META[step].label}
            </p>
            <p className="mt-1 font-display text-lg font-semibold text-foreground">
              {Math.round(progress)}% complete
            </p>
          </div>
          <div className="flex gap-2">
            {QUIZ_STEPS.map((s, i) => (
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

        <motion.div
          key={step}
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
        <Card className="noir-glass">
          {step === "genres" && (
            <>
              <CardTitle>What genres do you reach for?</CardTitle>
              <CardDescription className="mt-2 mb-6">
                Pick up to 6 genres you want more vinyl recommendations in.
              </CardDescription>
              <ToggleGrid options={QUIZ_GENRES} selected={genres} onChange={setGenres} max={6} />
            </>
          )}

          {step === "background" && (
            <>
              <CardTitle>Tell us a bit about your vinyl journey</CardTitle>
              <CardDescription className="mt-2 mb-6">
                This helps us pick the right kind of artist and album questions next —
                no wrong answers.
              </CardDescription>
              <div className="space-y-6">
                <div>
                  <p className="mb-3 text-sm font-medium text-foreground">
                    How deep is your record collection experience?
                  </p>
                  <div className="space-y-3">
                    {(
                      [
                        ["new", "Just getting into vinyl", "I'm still discovering what I like"],
                        ["casual", "Building my collection", "I know my favorites but I'm still exploring"],
                        ["collector", "Deep collector", "I've got range and I know deep cuts"],
                      ] as const
                    ).map(([value, label, desc]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setExperienceLevel(value)}
                        className={cn(
                          "pressable focus-ring w-full rounded-xl border p-4 text-left",
                          experienceLevel === value
                            ? "border-accent bg-accent-muted"
                            : "border-border hover:border-accent/50",
                        )}
                      >
                        <div className="font-medium text-foreground">{label}</div>
                        <div className="text-sm text-muted">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-sm font-medium text-foreground">
                    What decade were you born? <span className="text-muted">(optional)</span>
                  </p>
                  <ToggleGrid
                    options={BIRTH_DECADES}
                    selected={birthDecade ? [birthDecade] : []}
                    onChange={(next) => setBirthDecade(next[next.length - 1] ?? null)}
                    max={1}
                  />
                </div>
              </div>
            </>
          )}

          {step === "connectSpotify" && (
            <>
              <CardTitle>Connect Spotify (optional)</CardTitle>
              <CardDescription className="mt-2 mb-6">
                We&rsquo;ll tailor the next two questions to what you actually listen to
                instead of guessing. Skip ahead any time — this won&rsquo;t block your
                progress.
              </CardDescription>
              {hasSpotifyArtists || hasSpotifyAlbums ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Connected — the next two questions will use your real listening data.
                </p>
              ) : spotifySyncState === "syncing" ? (
                <VinylLoader variant="inline" context="spotify" />
              ) : status === "authenticated" ? (
                <p className="text-sm text-muted">
                  Connected, but we don&rsquo;t have enough listening history yet — you&rsquo;ll
                  see our usual curated picks next.
                </p>
              ) : (
                <Button
                  onClick={() => signIn("spotify", { callbackUrl: "/quiz?step=connectSpotify" })}
                  className="gap-2"
                >
                  <Music className="h-4 w-4" />
                  Connect Spotify
                </Button>
              )}
            </>
          )}

          {step === "subGenres" && (
            <>
              <CardTitle>Drill into your genres</CardTitle>
              <CardDescription className="mt-2 mb-6">
                Pick up to 3 sub-genres per genre — this sharpens our algorithm.
              </CardDescription>
              <div className="space-y-6">
                {(genres.length > 0 ? genres : (["Rock"] as QuizGenre[])).map((genre) => (
                  <div key={genre}>
                    <p className="mb-2 text-sm font-medium text-foreground">{genre}</p>
                    <ToggleGrid
                      options={QUIZ_SUB_GENRES[genre]}
                      selected={subGenres[genre] ?? []}
                      onChange={(next) => setSubGenres({ ...subGenres, [genre]: next })}
                      max={3}
                    />
                  </div>
                ))}
              </div>
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

          {step === "recognizedArtists" && (
            <>
              <CardTitle>
                {hasSpotifyArtists ? "Here's what you've been playing" : "Know these artists?"}
              </CardTitle>
              <CardDescription className="mt-2 mb-6">
                {hasSpotifyArtists
                  ? "Own any of these on vinyl, or seen them live? The strongest signal we can get."
                  : "Tell us who you already own on vinyl or have seen live — the strongest signal we can get. Don't recognize any? Skip ahead, that's fine too."}
              </CardDescription>
              <div className="space-y-2">
                {recognizedArtistPool.map((artist) => {
                  const owned = ownedArtists.includes(artist);
                  const seenLive = seenLiveArtists.includes(artist);
                  return (
                    <div
                      key={artist}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                    >
                      <span className="font-medium text-foreground">{artist}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleOwned(artist)}
                          className={cn(
                            "pressable focus-ring rounded-full border px-3 py-1.5 text-xs",
                            owned
                              ? "border-accent bg-accent-muted text-accent"
                              : "border-border text-muted hover:border-accent/50 hover:text-foreground",
                          )}
                        >
                          Own on vinyl
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSeenLive(artist)}
                          className={cn(
                            "pressable focus-ring rounded-full border px-3 py-1.5 text-xs",
                            seenLive
                              ? "border-accent bg-accent-muted text-accent"
                              : "border-border text-muted hover:border-accent/50 hover:text-foreground",
                          )}
                        >
                          Seen live
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {step === "albumBattles" && (
            <>
              <CardTitle>
                {hasSpotifyAlbums ? "Which of your own favorites?" : "Quick album picks"}
              </CardTitle>
              <CardDescription className="mt-2 mb-6">
                {hasSpotifyAlbums
                  ? "Pulled straight from your listening history — which would you rather spin?"
                  : "Choose the album you would rather spin — these teach us your taste fast. Not sure? Skip ahead, no pressure."}
              </CardDescription>
              <div className="space-y-4">
                {battles.map((pair) => (
                  <AlbumBattleCard
                    key={pair.id}
                    pair={pair}
                    selection={battleSelections[pair.id] ?? null}
                    onSelect={(winner) =>
                      setBattleSelections({ ...battleSelections, [pair.id]: winner })
                    }
                  />
                ))}
              </div>
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
                      "pressable focus-ring w-full rounded-xl border p-4 text-left",
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

          {step === "formatPreference" && (
            <>
              <CardTitle>Original pressings or reissues?</CardTitle>
              <CardDescription className="mt-2 mb-6">
                Originals can run pricier and harder to find — reissues are often
                cheaper and easier to grab in great condition.
              </CardDescription>
              <div className="space-y-3">
                {(
                  [
                    ["originals", "Original pressings only", "I want the record as it first came out"],
                    ["either", "No strong preference", "Whatever pressing sounds and looks good"],
                    ["reissues", "Reissues are great", "I'm happy with a modern repress"],
                  ] as const
                ).map(([value, label, desc]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFormatPreference(value)}
                    className={cn(
                      "pressable focus-ring w-full rounded-xl border p-4 text-left",
                      formatPreference === value
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
              <Range
                min={0}
                max={100}
                value={deepCutLevel}
                onChange={(e) => setDeepCutLevel(Number(e.target.value))}
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
        </motion.div>

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
          {stepIndex < QUIZ_STEPS.length - 1 ? (
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
