import { describe, it, expect } from "vitest";
import {
  mapQuizGenresToSpotify,
  quizAffinityAdjustment,
  buildFeedbackAffinity,
  feedbackAffinityAdjustment,
  collectReasonBuckets,
  interleaveReasons,
} from "@/lib/recommendations/engine";
import { deriveTopGenres } from "@/lib/spotify/client";
import type {
  SpotifyArtist,
  FeedbackEntry,
  WishlistItem,
  Recommendation,
  SpotifyAlbum,
  TasteProfileData,
} from "@/lib/types";

describe("mapQuizGenresToSpotify", () => {
  it("maps quiz genres to Spotify seed slugs", () => {
    expect(mapQuizGenresToSpotify(["Hip-Hop", "R&B"])).toEqual(["hip-hop", "r-n-b"]);
  });

  it("caps the seed list at 5", () => {
    const out = mapQuizGenresToSpotify([
      "Rock",
      "Jazz",
      "Soul",
      "Funk",
      "Pop",
      "Blues",
    ]);
    expect(out).toHaveLength(5);
  });
});

describe("deriveTopGenres", () => {
  it("ranks genres by frequency across artists", () => {
    const artists: SpotifyArtist[] = [
      { id: "1", name: "A", genres: ["rock", "indie"], popularity: 50 },
      { id: "2", name: "B", genres: ["rock"], popularity: 60 },
      { id: "3", name: "C", genres: ["jazz", "rock"], popularity: 40 },
    ];
    expect(deriveTopGenres(artists)[0]).toBe("rock");
  });

  it("returns an empty list when there are no genres", () => {
    expect(deriveTopGenres([])).toEqual([]);
  });
});

describe("quizAffinityAdjustment", () => {
  const neutralProfile = { moods: [], albumPreference: "balanced" as const, deepCutLevel: 50 };

  it("rewards mood overlap via genre tag hints", () => {
    const groovy = { genres: ["Funk"], formats: [], wantCount: null };
    const withMood = quizAffinityAdjustment(groovy, {
      ...neutralProfile,
      moods: ["Groovy"],
    });
    const withoutMood = quizAffinityAdjustment(groovy, neutralProfile);
    expect(withMood).toBeGreaterThan(withoutMood);
  });

  it("penalizes singles/EPs when the user prefers full albums", () => {
    const single = { genres: [], formats: ['7"', "Single"], wantCount: null };
    const album = { genres: [], formats: ["Vinyl", "LP", "Album"], wantCount: null };
    const profile = { ...neutralProfile, albumPreference: "full_albums" as const };
    expect(quizAffinityAdjustment(single, profile)).toBeLessThan(
      quizAffinityAdjustment(album, profile),
    );
  });

  it("penalizes full albums (lightly) when the user prefers singles", () => {
    const single = { genres: [], formats: ['7"', "Single"], wantCount: null };
    const album = { genres: [], formats: ["Vinyl", "LP", "Album"], wantCount: null };
    const profile = { ...neutralProfile, albumPreference: "singles" as const };
    expect(quizAffinityAdjustment(album, profile)).toBeLessThan(
      quizAffinityAdjustment(single, profile),
    );
  });

  it("boosts popular picks for low deep-cut appetite, and obscure picks for high appetite", () => {
    const popular = { genres: [], formats: [], wantCount: 5000 };
    const obscure = { genres: [], formats: [], wantCount: 10 };

    const mainstreamLover = { ...neutralProfile, deepCutLevel: 10 };
    expect(quizAffinityAdjustment(popular, mainstreamLover)).toBeGreaterThan(
      quizAffinityAdjustment(obscure, mainstreamLover),
    );

    const deepCutLover = { ...neutralProfile, deepCutLevel: 90 };
    expect(quizAffinityAdjustment(obscure, deepCutLover)).toBeGreaterThan(
      quizAffinityAdjustment(popular, deepCutLover),
    );
  });

  it("is neutral (0) for a mid deep-cut level, no moods, and no album preference", () => {
    const rec = { genres: ["Rock"], formats: ["LP"], wantCount: 5000 };
    expect(quizAffinityAdjustment(rec, neutralProfile)).toBe(0);
  });
});

describe("buildFeedbackAffinity + feedbackAffinityAdjustment", () => {
  const feedback: FeedbackEntry[] = [
    { discogsReleaseId: 1, artist: "Loved Artist", signal: "like" },
    { discogsReleaseId: 2, artist: "Hated Artist", signal: "dislike" },
    { discogsReleaseId: 3, artist: "Owned Artist", signal: "own" },
  ];
  const wishlist: WishlistItem[] = [
    {
      id: 1,
      discogsReleaseId: 9,
      title: "Wishlisted Album",
      artist: "Wishlisted Artist",
      coverUrl: null,
      year: 2000,
      notes: "",
      addedAt: new Date(),
      priceAtAdd: null,
      lastAlertedPrice: null,
    },
  ];

  it("boosts a liked artist and case-insensitively matches", () => {
    const affinity = buildFeedbackAffinity(feedback, wishlist);
    expect(feedbackAffinityAdjustment("loved artist", affinity)).toBeGreaterThan(0);
  });

  it("penalizes a disliked artist more than it boosts a liked one", () => {
    const affinity = buildFeedbackAffinity(feedback, wishlist);
    const boost = feedbackAffinityAdjustment("Loved Artist", affinity);
    const penalty = feedbackAffinityAdjustment("Hated Artist", affinity);
    expect(penalty).toBeLessThan(0);
    expect(Math.abs(penalty)).toBeGreaterThan(boost);
  });

  it("boosts a wishlisted artist", () => {
    const affinity = buildFeedbackAffinity(feedback, wishlist);
    expect(feedbackAffinityAdjustment("Wishlisted Artist", affinity)).toBeGreaterThan(0);
  });

  it("is neutral for an artist with no signal (own/hide don't affect ranking here)", () => {
    const affinity = buildFeedbackAffinity(feedback, wishlist);
    expect(feedbackAffinityAdjustment("Owned Artist", affinity)).toBe(0);
    expect(feedbackAffinityAdjustment("Unknown Artist", affinity)).toBe(0);
  });

  it("defaults to an empty wishlist when omitted", () => {
    const affinity = buildFeedbackAffinity(feedback);
    expect(affinity.wishlistArtists.size).toBe(0);
  });
});

describe("interleaveReasons", () => {
  it("round-robins across sources instead of exhausting one source first", () => {
    const out = interleaveReasons({
      spotify: ["spotify1", "spotify2", "spotify3"],
      quiz: ["quiz1"],
      community: ["community1"],
    });
    // A pure priority-order bug would put all 3 spotify reasons before quiz1.
    // Round-robin guarantees quiz1 lands in the first 2 (spotify, quiz, ...).
    expect(out.slice(0, 2)).toContain("quiz1");
    expect(out).toEqual(["spotify1", "quiz1", "community1", "spotify2", "spotify3"]);
  });

  it("returns a fallback when every bucket is empty", () => {
    expect(interleaveReasons({ spotify: [], quiz: [], community: [] })).toEqual([
      "Recommended based on your taste profile",
    ]);
  });

  it("is a no-op ordering when only one bucket has entries (quiz-only path)", () => {
    const out = interleaveReasons({
      spotify: [],
      quiz: ["quiz1", "quiz2"],
      community: [],
    });
    expect(out).toEqual(["quiz1", "quiz2"]);
  });
});

describe("collectReasonBuckets", () => {
  const profile: TasteProfileData = {
    genres: ["Rock"],
    decades: ["1990s"],
    moods: ["Groovy"],
    albumPreference: "balanced",
    deepCutLevel: 50,
    completedAt: new Date(),
  };

  const album: SpotifyAlbum = {
    id: "album1",
    name: "Test Album",
    artist: "Test Artist",
    artistId: "artist1",
    releaseDate: "1995-01-01",
    imageUrl: null,
    spotifyUrl: "",
  };

  const rec: Recommendation = {
    discogsReleaseId: 1,
    title: "Test Album",
    artist: "Test Artist",
    year: 1995,
    coverUrl: null,
    genres: ["Funk"],
    formats: ["Vinyl", "LP"],
    communityRating: null,
    ratingCount: null,
    wantCount: null,
    haveCount: null,
    spotifyAlbumId: null,
    spotifyUrl: null,
    score: 0,
    reasons: [],
  };

  it("buckets a top-artist match under spotify, a decade match under quiz", () => {
    const matchedArtist: SpotifyArtist = {
      id: "artist1",
      name: "Test Artist",
      genres: [],
      popularity: 50,
    };
    const buckets = collectReasonBuckets(rec, profile, matchedArtist, album, {});
    expect(buckets.spotify).toEqual(["Related to your top artist Test Artist"]);
    expect(buckets.quiz).toContain("Fits your 1990s era preference");
  });

  it("buckets community rating under community, not quiz or spotify", () => {
    const rated = { ...rec, communityRating: 4.5, ratingCount: 100 };
    const buckets = collectReasonBuckets(rated, profile, null, album, {});
    expect(buckets.community).toEqual(["Highly rated on Discogs (4.5/5)"]);
  });

  it("attributes the deep-cut-preference reason to quiz, even though want-count is community data", () => {
    const deepCutProfile = { ...profile, deepCutLevel: 90 };
    const obscure = { ...rec, wantCount: 10, communityRating: null };
    const buckets = collectReasonBuckets(obscure, deepCutProfile, null, album, {});
    expect(buckets.quiz).toContain("A lesser-known pressing, per your deep-cut preference");
    expect(buckets.community).toEqual([]);
  });

  it("produces no spotify reasons when there is no snapshot/taste-vector context (quiz-only path)", () => {
    const buckets = collectReasonBuckets(rec, profile, null, album, {});
    expect(buckets.spotify).toEqual([]);
  });
});
