import { describe, it, expect } from "vitest";
import {
  pickAlbumBattles,
  battleToPreference,
  ALBUM_BATTLE_PAIRS,
  ALBUM_BATTLE_PAIRS_BEGINNER,
} from "@/lib/quiz/album-battles";

describe("pickAlbumBattles", () => {
  it("favors pairs from the user's chosen genres first", () => {
    const picks = pickAlbumBattles(["Jazz"], "casual", 1);
    expect(picks).toEqual([ALBUM_BATTLE_PAIRS.find((p) => p.genre === "Jazz")]);
  });

  it("falls back to Rock when no genres are chosen", () => {
    const picks = pickAlbumBattles([], "casual", 1);
    expect(picks[0].genre).toBe("Rock");
  });

  it("draws from the beginner tier when experienceLevel is 'new'", () => {
    const picks = pickAlbumBattles(["Jazz"], "new", 1);
    expect(picks).toEqual([ALBUM_BATTLE_PAIRS_BEGINNER.find((p) => p.genre === "Jazz")]);
  });

  it("defaults to the casual/collector tier when experienceLevel is omitted", () => {
    const picks = pickAlbumBattles(["Jazz"], undefined, 1);
    expect(picks).toEqual([ALBUM_BATTLE_PAIRS.find((p) => p.genre === "Jazz")]);
  });

  it("never duplicates a pair and respects the count", () => {
    const picks = pickAlbumBattles(["Rock", "Indie", "Jazz"], "casual", 3);
    expect(picks.length).toBeLessThanOrEqual(3);
    expect(new Set(picks.map((p) => p.id)).size).toBe(picks.length);
  });
});

describe("battleToPreference", () => {
  it("records the winner/loser album titles and artists for side A", () => {
    const pair = ALBUM_BATTLE_PAIRS[0];
    const pref = battleToPreference(pair, "A");
    expect(pref.winnerTitle).toBe(pair.albumA.title);
    expect(pref.loserTitle).toBe(pair.albumB.title);
  });

  it("records the winner/loser album titles and artists for side B", () => {
    const pair = ALBUM_BATTLE_PAIRS[0];
    const pref = battleToPreference(pair, "B");
    expect(pref.winnerTitle).toBe(pair.albumB.title);
    expect(pref.loserTitle).toBe(pair.albumA.title);
  });
});
