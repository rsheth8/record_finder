import type {
  FeedbackEntry,
  QuizDecade,
  QuizGenre,
  QuizMood,
  Recommendation,
  SpotifyAlbum,
  SpotifyArtist,
  TasteProfileData,
  TasteVector,
  QuizAlbumPreference,
  QuizRecognizedArtists,
  WishlistItem,
} from "@/lib/types";
import { browseByGenreDecade, searchVinylRelease } from "@/lib/discogs/client";
import { getArtistTags, getCoverArt, searchReleaseGroup } from "@/lib/musicbrainz/client";
import { getSimilarArtists, isLastfmConfigured } from "@/lib/lastfm/client";
import type { SimilarArtist } from "@/lib/lastfm/client";
import { searchAlbum as searchAppleMusicAlbum } from "@/lib/apple-music/client";
import { mapWithConcurrency } from "@/lib/utils/rate-limited-pool";
import { isFullAlbum, isReissue } from "@/lib/recommendations/match";
import type { StoredSpotifySnapshot } from "@/lib/db/queries";

/** Quiz moods map to genre/tag hints (from MusicBrainz/Last.fm) so a mood
 * preference can nudge scoring toward records that actually carry that vibe. */
const MOOD_TAG_HINTS: Record<QuizMood, string[]> = {
  Chill: ["mellow", "chill", "chillout", "ambient", "downtempo"],
  Energetic: ["energetic", "upbeat", "dance", "party"],
  Melancholy: ["melancholy", "sad", "melancholic", "moody"],
  Uplifting: ["uplifting", "feel good", "happy"],
  Dark: ["dark", "gothic", "industrial", "doom"],
  Dreamy: ["dreamy", "dream pop", "shoegaze", "ethereal", "atmospheric"],
  Groovy: ["groovy", "funk", "funky", "groove", "soul"],
  Raw: ["lo-fi", "lofi", "raw", "garage"],
};

const POPULAR_WANT_THRESHOLD = 500;
const RECENCY_DECAY_DAYS = 7;

function albumMatchesPreference(
  album: SpotifyAlbum,
  pref: QuizAlbumPreference,
  side: "winner" | "loser",
): boolean {
  const title = side === "winner" ? pref.winnerTitle : pref.loserTitle;
  const artist = side === "winner" ? pref.winnerArtist : pref.loserArtist;
  const titleMatch =
    album.name.toLowerCase().includes(title.toLowerCase()) ||
    title.toLowerCase().includes(album.name.toLowerCase());
  if (!artist) return titleMatch;
  return (
    titleMatch &&
    album.artist.toLowerCase().includes(artist.toLowerCase())
  );
}
export interface TasteContext {
  tasteVector?: TasteVector | null;
  snapshot?: StoredSpotifySnapshot | null;
  wishlist?: WishlistItem[];
  similarArtists?: SimilarArtist[];
  quizAlbumPreferences?: QuizAlbumPreference[];
  quizSubGenres?: string[];
  quizRecognizedArtists?: QuizRecognizedArtists;
}

function moodOverlap(albumGenres: string[], moods: QuizMood[]): number {
  if (moods.length === 0) return 0;
  const tags = albumGenres.map((g) => g.toLowerCase());
  let matches = 0;
  for (const mood of moods) {
    const hints = MOOD_TAG_HINTS[mood] ?? [];
    if (hints.some((h) => tags.some((t) => t.includes(h)))) matches += 1;
  }
  return matches;
}

/** Score delta from the quiz signals that don't depend on Spotify listening
 * data — mood, album-vs-singles preference, originals-vs-reissues preference,
 * and deep-cut appetite — shared so both the Spotify-seeded and quiz-only
 * recommendation paths apply them consistently. (Quiz-only previously only
 * used these for reason text, never for ranking.) */
export function quizAffinityAdjustment(
  rec: Pick<Recommendation, "genres" | "formats" | "wantCount">,
  profile: Pick<
    TasteProfileData,
    "moods" | "albumPreference" | "formatPreference" | "deepCutLevel"
  >,
): number {
  let delta = 0;

  delta += moodOverlap(rec.genres, profile.moods) * 6;

  if (profile.albumPreference === "full_albums" && !isFullAlbum(rec.formats)) {
    delta -= 12;
  } else if (profile.albumPreference === "singles" && isFullAlbum(rec.formats)) {
    delta -= 4;
  }

  const reissue = isReissue(rec.formats);
  if (profile.formatPreference === "originals" && reissue) {
    delta -= 10;
  } else if (profile.formatPreference === "reissues" && !reissue) {
    delta -= 3;
  }

  const popular = rec.wantCount !== null && rec.wantCount >= POPULAR_WANT_THRESHOLD;
  if (profile.deepCutLevel < 40) {
    delta += popular ? 8 : 0;
  } else if (profile.deepCutLevel > 70) {
    delta += popular ? -8 : 6;
  }

  return delta;
}

export interface FeedbackAffinity {
  likedArtists: Set<string>;
  dislikedArtists: Set<string>;
  wishlistArtists: Set<string>;
}

/** Precomputes lowercased artist-name sets from the user's like/dislike
 * feedback and wishlist, once per generation, for cheap lookup per candidate. */
export function buildFeedbackAffinity(
  feedback: FeedbackEntry[],
  wishlist: WishlistItem[] = [],
): FeedbackAffinity {
  return {
    likedArtists: new Set(
      feedback.filter((f) => f.signal === "like").map((f) => f.artist.toLowerCase()),
    ),
    dislikedArtists: new Set(
      feedback.filter((f) => f.signal === "dislike").map((f) => f.artist.toLowerCase()),
    ),
    wishlistArtists: new Set(wishlist.map((w) => w.artist.toLowerCase())),
  };
}

/** Score delta from the user's own signals about an artist — liked, disliked,
 * or already wishlisted. Shared so quiz-only recommendations respect feedback
 * too (previously only the Spotify-seeded path did; quiz-only ignored it
 * entirely beyond the separate hide/own exclusion filter). */
export function feedbackAffinityAdjustment(
  artist: string,
  affinity: FeedbackAffinity,
): number {
  const key = artist.toLowerCase();
  let delta = 0;
  if (affinity.likedArtists.has(key)) delta += 15;
  if (affinity.dislikedArtists.has(key)) delta -= 25;
  if (affinity.wishlistArtists.has(key)) delta += 15;
  return delta;
}

export interface QuizArtistAffinity {
  ownedArtists: Set<string>;
  seenLiveArtists: Set<string>;
}

/** Precomputes lowercased artist-name sets from the quiz's artist recognition
 * grid ("own on vinyl" / "seen live") — a quiz-declared artist affinity,
 * distinct from Spotify listening data and from in-app like/dislike
 * feedback. */
export function buildQuizArtistAffinity(
  recognizedArtists: QuizRecognizedArtists = { owned: [], seenLive: [] },
): QuizArtistAffinity {
  return {
    ownedArtists: new Set(recognizedArtists.owned.map((a) => a.toLowerCase())),
    seenLiveArtists: new Set(recognizedArtists.seenLive.map((a) => a.toLowerCase())),
  };
}

/** Score delta from the quiz's artist recognition grid. Seeing an artist live
 * is weighted slightly above owning them on vinyl already — it's a harder,
 * more deliberate signal of real fandom than a vinyl purchase. */
export function quizArtistAffinityAdjustment(
  artist: string,
  affinity: QuizArtistAffinity,
): number {
  const key = artist.toLowerCase();
  let delta = 0;
  if (affinity.ownedArtists.has(key)) delta += 10;
  if (affinity.seenLiveArtists.has(key)) delta += 12;
  return delta;
}

const GENRE_TO_SPOTIFY: Record<QuizGenre, string> = {
  Rock: "rock",
  Alternative: "alt-rock",
  Indie: "indie",
  "Hip-Hop": "hip-hop",
  "R&B": "r-n-b",
  Jazz: "jazz",
  Soul: "soul",
  Funk: "funk",
  Electronic: "electronic",
  Pop: "pop",
  Punk: "punk",
  Metal: "metal",
  Folk: "folk",
  Country: "country",
  Blues: "blues",
  Classical: "classical",
  Reggae: "reggae",
  Latin: "latin",
};

function decadeMatches(year: number | null, decades: QuizDecade[]): boolean {
  if (!year || decades.length === 0) return true;
  const decade = Math.floor(year / 10) * 10;
  return decades.some((d) => decade === parseInt(d.replace("s", ""), 10));
}

/** Quiz-genre overlap only — kept separate from `spotifyGenreOverlap` so the
 * two can be scored into `quizScore` and `score` respectively rather than one
 * combined number that hides how much either signal actually contributed. */
function quizGenreOverlap(albumGenres: string[], quizGenres: QuizGenre[]): number {
  const normalizedQuiz = quizGenres.map((g) => g.toLowerCase());
  const normalizedAlbum = albumGenres.map((g) => g.toLowerCase());
  let score = 0;
  for (const g of normalizedQuiz) {
    if (normalizedAlbum.some((a) => a.includes(g) || g.includes(a))) score += 2;
  }
  return score;
}

function spotifyGenreOverlap(albumGenres: string[], spotifyGenres: string[]): number {
  const normalizedSpotify = spotifyGenres.map((g) => g.toLowerCase());
  const normalizedAlbum = albumGenres.map((g) => g.toLowerCase());
  let score = 0;
  for (const g of normalizedSpotify) {
    if (normalizedAlbum.some((a) => a.includes(g) || g.includes(a))) score += 1;
  }
  return score;
}

/**
 * Reason strings grouped by *why* they exist — not shown to users directly,
 * used only to interleave the final list (see `buildReasons`) so a listening
 * history signal doesn't systematically bury a quiz signal.
 */
interface ReasonBuckets {
  /** Derived from Spotify listening history / the taste vector. */
  spotify: string[];
  /** Derived from quiz answers (genres, decades, moods, deep-cut level). */
  quiz: string[];
  /** Derived from Discogs community data (rating, want count). */
  community: string[];
}

/** Every reason a pick could be shown for, un-ordered and categorized by
 * source. Split from `buildReasons` purely so the interleave step below is
 * independently testable without needing a real Discogs/Spotify fixture. */
export function collectReasonBuckets(
  rec: Recommendation,
  profile: TasteProfileData,
  matchedArtist: SpotifyArtist | null,
  album: SpotifyAlbum,
  context: TasteContext,
): ReasonBuckets {
  const spotify: string[] = [];
  const quiz: string[] = [];
  const community: string[] = [];
  const { tasteVector, snapshot } = context;
  const artistKey = album.artist.toLowerCase();

  if (tasteVector && album.artistId && tasteVector.artistWeights[album.artistId] >= 0.7) {
    spotify.push(`Related to your top artist ${album.artist}`);
  } else if (matchedArtist) {
    spotify.push(`Related to your top artist ${matchedArtist.name}`);
  }

  const savedAlbum = snapshot?.savedAlbums.find((a) => a.id === album.id);
  if (savedAlbum) {
    spotify.push("In your saved albums");
  } else if (
    snapshot?.savedAlbums.some(
      (a) => a.artistId === album.artistId || a.artist.toLowerCase() === artistKey,
    )
  ) {
    const similar = snapshot.savedAlbums.find(
      (a) => a.artistId === album.artistId || a.artist.toLowerCase() === artistKey,
    );
    if (similar) {
      spotify.push(`Similar to ${similar.name} in your library`);
    }
  }

  const recentPlay = snapshot?.recentlyPlayed.find(
    (r) =>
      r.track.albumId === album.id ||
      r.track.artistId === album.artistId ||
      r.track.artist.toLowerCase() === artistKey,
  );
  if (recentPlay) {
    const daysAgo =
      (Date.now() - new Date(recentPlay.playedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo <= RECENCY_DECAY_DAYS) {
      spotify.push(`You've been playing a lot of ${album.artist} lately`);
    }
  }

  if (
    tasteVector?.coreArtistIds.includes(album.artistId) &&
    rec.wantCount !== null &&
    rec.wantCount < POPULAR_WANT_THRESHOLD
  ) {
    spotify.push(`Deep cut from an artist you love long-term`);
  }

  const matchedDecade = profile.decades.find((d) => {
    if (!rec.year) return false;
    const decade = Math.floor(rec.year / 10) * 10;
    return decade === parseInt(d.replace("s", ""), 10);
  });
  if (matchedDecade) {
    quiz.push(`Fits your ${matchedDecade} era preference`);
  }

  const matchedGenre = profile.genres.find((g) =>
    rec.genres.some((rg) => rg.toLowerCase().includes(g.toLowerCase())),
  );
  if (matchedGenre) {
    quiz.push(`Matches your ${matchedGenre} taste from the quiz`);
  }

  const matchedMood = profile.moods.find((mood) =>
    (MOOD_TAG_HINTS[mood] ?? []).some((h) =>
      rec.genres.some((rg) => rg.toLowerCase().includes(h)),
    ),
  );
  if (matchedMood) {
    quiz.push(`Has that ${matchedMood.toLowerCase()} feel you picked`);
  }

  const recognizedArtists = context.quizRecognizedArtists;
  if (recognizedArtists?.seenLive.some((a) => a.toLowerCase() === artistKey)) {
    quiz.push(`You told us you've seen ${album.artist} live`);
  } else if (recognizedArtists?.owned.some((a) => a.toLowerCase() === artistKey)) {
    quiz.push(`You already own ${album.artist} on vinyl`);
  }

  if (rec.communityRating && rec.communityRating >= 4) {
    community.push(
      `Highly rated on Discogs (${rec.communityRating.toFixed(1)}/5)`,
    );
  } else if (
    profile.deepCutLevel > 70 &&
    rec.wantCount !== null &&
    rec.wantCount < POPULAR_WANT_THRESHOLD
  ) {
    // Deep-cut appetite is a quiz answer, even though want-count is community
    // data — the *reason this pick qualifies* is the quiz preference.
    quiz.push("A lesser-known pressing, per your deep-cut preference");
  } else if (rec.wantCount !== null && rec.wantCount >= POPULAR_WANT_THRESHOLD) {
    community.push(`Wanted by ${rec.wantCount.toLocaleString()} collectors`);
  }

  return { spotify, quiz, community };
}

/** Fixed prefixes of every reason string `collectReasonBuckets` can push into
 * its `spotify` bucket — kept in sync with those `spotify.push(...)` calls
 * above. Used by `hasSpotifyReason` to detect, from an already-interleaved
 * `Recommendation.reasons` array, whether a pick cited saved/recent/core
 * taste — the "% of recommendations with specific reasons" success metric. */
const SPOTIFY_REASON_PREFIXES = [
  "Related to your top artist",
  "In your saved albums",
  "Similar to ",
  "You've been playing a lot of ",
  "Deep cut from an artist you love long-term",
];

/** True when at least one of a recommendation's (already-interleaved) reason
 * strings was Spotify-listening-derived. */
export function hasSpotifyReason(reasons: string[]): boolean {
  return reasons.some((r) => SPOTIFY_REASON_PREFIXES.some((p) => r.startsWith(p)));
}

/** Round-robins the three source buckets (spotify, quiz, community) into one
 * list, so a source with many matches (typically Spotify — a connected user
 * can rack up 4+ listening-history reasons) can't push every other source's
 * reasons off the front. UI surfaces (poster cards) truncate hard to the
 * first 1-2 entries, so *order* here is what determines what a user actually
 * sees, not just what reasons exist. */
export function interleaveReasons(buckets: ReasonBuckets): string[] {
  const queues = [buckets.spotify, buckets.quiz, buckets.community].map((b) => [...b]);
  const reasons: string[] = [];
  let took = true;
  while (took) {
    took = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next !== undefined) {
        reasons.push(next);
        took = true;
      }
    }
  }
  return reasons.length > 0 ? reasons : ["Recommended based on your taste profile"];
}

function buildReasons(
  rec: Recommendation,
  profile: TasteProfileData,
  matchedArtist: SpotifyArtist | null,
  album: SpotifyAlbum,
  context: TasteContext,
): string[] {
  return interleaveReasons(
    collectReasonBuckets(rec, profile, matchedArtist, album, context),
  );
}

/** Collects de-duplicated similar-artist names for the user's top artists once
 * (not per-candidate). Used both to seed new-to-you discovery candidates and to
 * boost the score of any candidate that shares a similar-artist relationship. */
export async function collectSimilarArtistNames(
  topArtists: SpotifyArtist[],
  perArtist = 15,
): Promise<string[]> {
  const withMatch = await collectSimilarArtistsWithMatch(topArtists, perArtist);
  return withMatch.map((a) => a.name);
}

export async function collectSimilarArtistsWithMatch(
  topArtists: SpotifyArtist[],
  perArtist = 15,
): Promise<SimilarArtist[]> {
  if (!isLastfmConfigured || topArtists.length === 0) return [];

  const lists = await mapWithConcurrency(
    topArtists.slice(0, 5),
    3,
    async (artist) => {
      try {
        return await getSimilarArtists(artist.name, perArtist);
      } catch {
        return [];
      }
    },
  );

  const byName = new Map<string, SimilarArtist>();
  for (const list of lists) {
    for (const similar of list) {
      const key = similar.name.toLowerCase();
      const existing = byName.get(key);
      if (!existing || similar.match > existing.match) {
        byName.set(key, similar);
      }
    }
  }
  return [...byName.values()];
}

/** Enriches a Discogs match with MusicBrainz genre tags and a cover-art fallback
 * chain (Discogs -> MusicBrainz Cover Art Archive -> Apple Music artwork). */
async function enrichCandidate(vinyl: Recommendation): Promise<Recommendation> {
  const [mbGroup, mbTags, appleAlbum] = await Promise.all([
    searchReleaseGroup(vinyl.artist, vinyl.title).catch(() => null),
    getArtistTags(vinyl.artist).catch(() => []),
    vinyl.coverUrl
      ? Promise.resolve(null)
      : searchAppleMusicAlbum(vinyl.artist, vinyl.title).catch(() => null),
  ]);

  let coverUrl = vinyl.coverUrl;
  if (!coverUrl && mbGroup?.mbid) {
    coverUrl = await getCoverArt(mbGroup.mbid).catch(() => null);
  }
  if (!coverUrl && appleAlbum?.artworkUrl) {
    coverUrl = appleAlbum.artworkUrl;
  }

  return {
    ...vinyl,
    coverUrl,
    genres: Array.from(new Set([...vinyl.genres, ...mbTags])),
  };
}

export async function scoreCandidates(
  candidates: SpotifyAlbum[],
  profile: TasteProfileData,
  topArtists: SpotifyArtist[],
  topGenres: string[],
  similarArtists: SimilarArtist[] = [],
  feedback: FeedbackEntry[] = [],
  context: TasteContext = {},
): Promise<Recommendation[]> {
  const similarByName = new Map(
    similarArtists.map((a) => [a.name.toLowerCase(), a.match]),
  );
  const {
    tasteVector,
    snapshot,
    wishlist = [],
    quizAlbumPreferences = [],
    quizSubGenres = [],
    quizRecognizedArtists,
  } = context;

  const wishlistReleaseIds = new Set(wishlist.map((w) => w.discogsReleaseId));
  const affinity = buildFeedbackAffinity(feedback, wishlist);
  const quizArtistAffinity = buildQuizArtistAffinity(quizRecognizedArtists);

  const scored = await mapWithConcurrency(
    candidates.slice(0, 35),
    4,
    async (album) => {
      const vinyl = await searchVinylRelease(album.artist, album.name);
      if (!vinyl) return null;

      if (wishlistReleaseIds.has(vinyl.discogsReleaseId)) return null;

      const enriched = await enrichCandidate(vinyl);

      const matchedArtist = topArtists.find(
        (a) =>
          a.id === album.artistId ||
          a.name.toLowerCase() === album.artist.toLowerCase(),
      );

      let score = 0;
      let quizScore = 0;
      score += spotifyGenreOverlap(enriched.genres, topGenres) * 10;
      quizScore += quizGenreOverlap(enriched.genres, profile.genres) * 10;

      if (quizSubGenres.length > 0) {
        const subMatches = quizSubGenres.filter((sg) =>
          enriched.genres.some(
            (g) =>
              g.toLowerCase().includes(sg.toLowerCase()) ||
              sg.toLowerCase().includes(g.toLowerCase()),
          ),
        ).length;
        quizScore += subMatches * 8;
      }

      if (decadeMatches(enriched.year, profile.decades)) quizScore += 15;

      const artistAffinity =
        tasteVector?.artistWeights[album.artistId] ??
        (matchedArtist ? 0.65 : 0);
      if (artistAffinity > 0) {
        score += Math.round(artistAffinity * 30);
      }

      const albumAffinity = tasteVector?.albumWeights[album.id] ?? 0;
      if (albumAffinity > 0) {
        score += Math.round(albumAffinity * 25);
      }

      const similarMatch = similarByName.get(album.artist.toLowerCase());
      if (similarMatch !== undefined) {
        score += Math.round((similarMatch / 100) * 12);
      }

      const isSavedAlbum = snapshot?.savedAlbums.some((a) => a.id === album.id);
      if (isSavedAlbum) {
        score += 20;
      } else if (
        snapshot?.savedAlbums.some(
          (a) =>
            a.artistId === album.artistId ||
            a.artist.toLowerCase() === album.artist.toLowerCase(),
        )
      ) {
        score += 10;
      }

      const recentPlay = snapshot?.recentlyPlayed.find(
        (r) =>
          r.track.albumId === album.id ||
          r.track.artistId === album.artistId,
      );
      if (recentPlay) {
        const daysAgo =
          (Date.now() - new Date(recentPlay.playedAt).getTime()) /
          (1000 * 60 * 60 * 24);
        if (daysAgo <= RECENCY_DECAY_DAYS) {
          const decay = 1 - daysAgo / RECENCY_DECAY_DAYS;
          score += Math.round(decay * 12);
        }
      }

      quizScore += quizAffinityAdjustment(enriched, profile);
      quizScore += quizArtistAffinityAdjustment(album.artist, quizArtistAffinity);

      if (enriched.communityRating !== null && (enriched.ratingCount ?? 0) >= 5) {
        score += enriched.communityRating * 3;
      }

      score += feedbackAffinityAdjustment(album.artist, affinity);

      for (const pref of quizAlbumPreferences) {
        if (albumMatchesPreference(album, pref, "winner")) {
          quizScore += 18;
          break;
        }
        if (albumMatchesPreference(album, pref, "loser")) {
          quizScore -= 8;
          break;
        }
      }

      enriched.spotifyAlbumId = album.id;
      enriched.spotifyUrl = album.spotifyUrl;
      enriched.score = score;
      enriched.quizScore = quizScore;
      enriched.reasons = buildReasons(
        enriched,
        profile,
        matchedArtist ?? null,
        album,
        context,
      );

      return { enriched, artist: album.artist };
    },
  );

  const artistCounts = new Map<string, number>();
  const results: Recommendation[] = [];

  for (const entry of scored) {
    if (!entry) continue;
    const artistCount = artistCounts.get(entry.artist) ?? 0;
    if (artistCount >= 2) entry.enriched.score -= 15;
    artistCounts.set(entry.artist, artistCount + 1);
    results.push(entry.enriched);
  }

  return results.sort((a, b) => b.score - a.score);
}

export async function getQuizOnlyRecommendations(
  profile: TasteProfileData,
  feedback: FeedbackEntry[] = [],
  wishlist: WishlistItem[] = [],
  recognizedArtists: QuizRecognizedArtists = { owned: [], seenLive: [] },
): Promise<Recommendation[]> {
  // 40, not 25 — browseByGenreDecade's Discogs call count is fixed at up to 6
  // (one per genre×decade combo) regardless of this limit, so raising it only
  // costs more of the *downstream* enrichment calls, not more browse calls.
  const results = await browseByGenreDecade(
    profile.genres,
    profile.decades,
    40,
  );
  const affinity = buildFeedbackAffinity(feedback, wishlist);
  const quizArtistAffinity = buildQuizArtistAffinity(recognizedArtists);
  const context: TasteContext = { quizRecognizedArtists: recognizedArtists };

  return results.map((r, i) => ({
    ...r,
    // Browse rank (want-sorted) plus feedback is the base relevance signal;
    // the mood/format/deep-cut adjustment goes into quizScore instead of
    // being folded in here, matching the Spotify path — see quizScore doc on
    // the Recommendation type.
    score: 50 - i + feedbackAffinityAdjustment(r.artist, affinity),
    quizScore:
      quizAffinityAdjustment(r, profile) +
      quizArtistAffinityAdjustment(r.artist, quizArtistAffinity),
    reasons: buildReasons(r, profile, null, {
      id: "",
      name: r.title,
      artist: r.artist,
      artistId: "",
      releaseDate: "",
      imageUrl: r.coverUrl,
      spotifyUrl: "",
    }, context),
  }));
}

export function mapQuizGenresToSpotify(genres: QuizGenre[]): string[] {
  return genres
    .map((g) => GENRE_TO_SPOTIFY[g])
    .filter(Boolean)
    .slice(0, 5);
}
