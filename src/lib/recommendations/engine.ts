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
  WishlistItem,
} from "@/lib/types";
import { browseByGenreDecade, searchVinylRelease } from "@/lib/discogs/client";
import { getArtistTags, getCoverArt, searchReleaseGroup } from "@/lib/musicbrainz/client";
import { getSimilarArtists, isLastfmConfigured } from "@/lib/lastfm/client";
import type { SimilarArtist } from "@/lib/lastfm/client";
import { searchAlbum as searchAppleMusicAlbum } from "@/lib/apple-music/client";
import { mapWithConcurrency } from "@/lib/utils/rate-limited-pool";
import { isFullAlbum } from "@/lib/recommendations/match";
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

function genreOverlap(
  albumGenres: string[],
  quizGenres: QuizGenre[],
  spotifyGenres: string[],
): number {
  const normalizedQuiz = quizGenres.map((g) => g.toLowerCase());
  const normalizedSpotify = spotifyGenres.map((g) => g.toLowerCase());
  const normalizedAlbum = albumGenres.map((g) => g.toLowerCase());

  let score = 0;
  for (const g of normalizedQuiz) {
    if (normalizedAlbum.some((a) => a.includes(g) || g.includes(a))) score += 2;
  }
  for (const g of normalizedSpotify) {
    if (normalizedAlbum.some((a) => a.includes(g) || g.includes(a))) score += 1;
  }
  return score;
}

function buildReasons(
  rec: Recommendation,
  profile: TasteProfileData,
  matchedArtist: SpotifyArtist | null,
  album: SpotifyAlbum,
  context: TasteContext,
): string[] {
  const reasons: string[] = [];
  const { tasteVector, snapshot } = context;
  const artistKey = album.artist.toLowerCase();

  if (tasteVector && album.artistId && tasteVector.artistWeights[album.artistId] >= 0.7) {
    reasons.push(`Related to your top artist ${album.artist}`);
  } else if (matchedArtist) {
    reasons.push(`Related to your top artist ${matchedArtist.name}`);
  }

  const savedAlbum = snapshot?.savedAlbums.find((a) => a.id === album.id);
  if (savedAlbum) {
    reasons.push("In your saved albums");
  } else if (
    snapshot?.savedAlbums.some(
      (a) => a.artistId === album.artistId || a.artist.toLowerCase() === artistKey,
    )
  ) {
    const similar = snapshot.savedAlbums.find(
      (a) => a.artistId === album.artistId || a.artist.toLowerCase() === artistKey,
    );
    if (similar) {
      reasons.push(`Similar to ${similar.name} in your library`);
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
      reasons.push(`You've been playing a lot of ${album.artist} lately`);
    }
  }

  if (
    tasteVector?.coreArtistIds.includes(album.artistId) &&
    rec.wantCount !== null &&
    rec.wantCount < POPULAR_WANT_THRESHOLD
  ) {
    reasons.push(`Deep cut from an artist you love long-term`);
  }

  const matchedDecade = profile.decades.find((d) => {
    if (!rec.year) return false;
    const decade = Math.floor(rec.year / 10) * 10;
    return decade === parseInt(d.replace("s", ""), 10);
  });
  if (matchedDecade) {
    reasons.push(`Fits your ${matchedDecade} era preference`);
  }

  const matchedGenre = profile.genres.find((g) =>
    rec.genres.some((rg) => rg.toLowerCase().includes(g.toLowerCase())),
  );
  if (matchedGenre) {
    reasons.push(`Matches your ${matchedGenre} taste from the quiz`);
  }

  const matchedMood = profile.moods.find((mood) =>
    (MOOD_TAG_HINTS[mood] ?? []).some((h) =>
      rec.genres.some((rg) => rg.toLowerCase().includes(h)),
    ),
  );
  if (matchedMood) {
    reasons.push(`Has that ${matchedMood.toLowerCase()} feel you picked`);
  }

  if (rec.communityRating && rec.communityRating >= 4) {
    reasons.push(
      `Highly rated on Discogs (${rec.communityRating.toFixed(1)}/5)`,
    );
  } else if (
    profile.deepCutLevel > 70 &&
    rec.wantCount !== null &&
    rec.wantCount < POPULAR_WANT_THRESHOLD
  ) {
    reasons.push("A lesser-known pressing, per your deep-cut preference");
  } else if (rec.wantCount !== null && rec.wantCount >= POPULAR_WANT_THRESHOLD) {
    reasons.push(`Wanted by ${rec.wantCount.toLocaleString()} collectors`);
  }

  if (reasons.length === 0) {
    reasons.push("Recommended based on your taste profile");
  }

  return reasons;
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
  const { tasteVector, snapshot, wishlist = [], quizAlbumPreferences = [], quizSubGenres = [] } = context;

  const wishlistArtists = new Set(
    wishlist.map((w) => w.artist.toLowerCase()),
  );
  const wishlistReleaseIds = new Set(wishlist.map((w) => w.discogsReleaseId));

  const likedArtists = new Set(
    feedback.filter((f) => f.signal === "like").map((f) => f.artist.toLowerCase()),
  );
  const dislikedArtists = new Set(
    feedback.filter((f) => f.signal === "dislike").map((f) => f.artist.toLowerCase()),
  );

  const scored = await mapWithConcurrency(
    candidates.slice(0, 25),
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
      score += genreOverlap(enriched.genres, profile.genres, topGenres) * 10;

      if (quizSubGenres.length > 0) {
        const subMatches = quizSubGenres.filter((sg) =>
          enriched.genres.some(
            (g) =>
              g.toLowerCase().includes(sg.toLowerCase()) ||
              sg.toLowerCase().includes(g.toLowerCase()),
          ),
        ).length;
        score += subMatches * 8;
      }

      if (decadeMatches(enriched.year, profile.decades)) score += 15;

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

      score += moodOverlap(enriched.genres, profile.moods) * 6;

      if (profile.albumPreference === "full_albums" && !isFullAlbum(enriched.formats)) {
        score -= 12;
      } else if (profile.albumPreference === "singles" && isFullAlbum(enriched.formats)) {
        score -= 4;
      }

      const popular =
        enriched.wantCount !== null && enriched.wantCount >= POPULAR_WANT_THRESHOLD;
      if (profile.deepCutLevel < 40) {
        score += popular ? 8 : 0;
      } else if (profile.deepCutLevel > 70) {
        score += popular ? -8 : 6;
      }

      if (enriched.communityRating !== null && (enriched.ratingCount ?? 0) >= 5) {
        score += enriched.communityRating * 3;
      }

      const artistKey = album.artist.toLowerCase();
      if (likedArtists.has(artistKey)) score += 15;
      if (dislikedArtists.has(artistKey)) score -= 25;
      if (wishlistArtists.has(artistKey)) score += 15;

      for (const pref of quizAlbumPreferences) {
        if (albumMatchesPreference(album, pref, "winner")) {
          score += 18;
          break;
        }
        if (albumMatchesPreference(album, pref, "loser")) {
          score -= 8;
          break;
        }
      }

      enriched.spotifyAlbumId = album.id;
      enriched.spotifyUrl = album.spotifyUrl;
      enriched.score = score;
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
): Promise<Recommendation[]> {
  const results = await browseByGenreDecade(
    profile.genres,
    profile.decades,
    25,
  );

  return results.map((r, i) => ({
    ...r,
    score: 50 - i,
    reasons: buildReasons(r, profile, null, {
      id: "",
      name: r.title,
      artist: r.artist,
      artistId: "",
      releaseDate: "",
      imageUrl: r.coverUrl,
      spotifyUrl: "",
    }, {}),
  }));
}

export function mapQuizGenresToSpotify(genres: QuizGenre[]): string[] {
  return genres
    .map((g) => GENRE_TO_SPOTIFY[g])
    .filter(Boolean)
    .slice(0, 5);
}
