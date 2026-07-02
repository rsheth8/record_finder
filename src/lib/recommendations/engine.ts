import type {
  QuizDecade,
  QuizGenre,
  Recommendation,
  SpotifyAlbum,
  SpotifyArtist,
  TasteProfileData,
} from "@/lib/types";
import { browseByGenreDecade, searchVinylRelease } from "@/lib/discogs/client";
import { getArtistTags, getCoverArt, searchReleaseGroup } from "@/lib/musicbrainz/client";
import { getSimilarArtists, isLastfmConfigured } from "@/lib/lastfm/client";
import { searchAlbum as searchAppleMusicAlbum } from "@/lib/apple-music/client";
import { mapWithConcurrency } from "@/lib/utils/rate-limited-pool";

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
): string[] {
  const reasons: string[] = [];

  if (matchedArtist) {
    reasons.push(`Related to your top artist ${matchedArtist.name}`);
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

  if (rec.communityRating && rec.communityRating >= 4) {
    reasons.push(
      `Highly rated on Discogs (${rec.communityRating.toFixed(1)}/5)`,
    );
  }

  if (reasons.length === 0) {
    reasons.push("Recommended based on your taste profile");
  }

  return reasons;
}

/** Fetches similar-artist sets for the user's top artists once (not per-candidate)
 * so recommendations sharing a similar-artist relationship get a scoring boost. */
async function buildSimilarArtistSet(
  topArtists: SpotifyArtist[],
): Promise<Set<string>> {
  if (!isLastfmConfigured || topArtists.length === 0) return new Set();

  const lists = await mapWithConcurrency(
    topArtists.slice(0, 5),
    3,
    async (artist) => {
      try {
        return await getSimilarArtists(artist.name, 15);
      } catch {
        return [];
      }
    },
  );

  const set = new Set<string>();
  for (const list of lists) {
    for (const similar of list) set.add(similar.name.toLowerCase());
  }
  return set;
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
): Promise<Recommendation[]> {
  const similarArtists = await buildSimilarArtistSet(topArtists);

  // Discogs lookups stay serialized behind its own rate limiter (its real
  // constraint), but concurrency here lets MusicBrainz/Last.fm/Apple Music
  // enrichment for candidate N overlap with the Discogs lookup for candidate
  // N+1, instead of blocking the whole loop on a fixed per-item sleep.
  const scored = await mapWithConcurrency(
    candidates.slice(0, 25),
    4,
    async (album) => {
      const vinyl = await searchVinylRelease(album.artist, album.name);
      if (!vinyl) return null;

      const enriched = await enrichCandidate(vinyl);

      const matchedArtist = topArtists.find(
        (a) =>
          a.id === album.artistId ||
          a.name.toLowerCase() === album.artist.toLowerCase(),
      );

      let score = 0;
      score += genreOverlap(enriched.genres, profile.genres, topGenres) * 10;
      if (decadeMatches(enriched.year, profile.decades)) score += 15;
      if (matchedArtist) score += 20;
      score += profile.deepCutLevel < 40 ? 5 : profile.deepCutLevel > 70 ? -5 : 0;
      if (similarArtists.has(album.artist.toLowerCase())) score += 8;

      enriched.spotifyAlbumId = album.id;
      enriched.spotifyUrl = album.spotifyUrl;
      enriched.score = score;
      enriched.reasons = buildReasons(enriched, profile, matchedArtist ?? null);

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
    reasons: buildReasons(r, profile, null),
  }));
}

export function mapQuizGenresToSpotify(genres: QuizGenre[]): string[] {
  return genres
    .map((g) => GENRE_TO_SPOTIFY[g])
    .filter(Boolean)
    .slice(0, 5);
}
