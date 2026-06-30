import type {
  QuizDecade,
  QuizGenre,
  Recommendation,
  SpotifyAlbum,
  SpotifyArtist,
  TasteProfileData,
} from "@/lib/types";
import { browseByGenreDecade, searchVinylRelease } from "@/lib/discogs/client";

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

export async function scoreCandidates(
  candidates: SpotifyAlbum[],
  profile: TasteProfileData,
  topArtists: SpotifyArtist[],
  topGenres: string[],
): Promise<Recommendation[]> {
  const results: Recommendation[] = [];
  const artistCounts = new Map<string, number>();

  for (const album of candidates.slice(0, 25)) {
    const vinyl = await searchVinylRelease(album.artist, album.name);
    if (!vinyl) continue;

    const matchedArtist = topArtists.find(
      (a) =>
        a.id === album.artistId ||
        a.name.toLowerCase() === album.artist.toLowerCase(),
    );

    let score = 0;
    score += genreOverlap(vinyl.genres, profile.genres, topGenres) * 10;
    if (decadeMatches(vinyl.year, profile.decades)) score += 15;
    if (matchedArtist) score += 20;
    score += profile.deepCutLevel < 40 ? 5 : profile.deepCutLevel > 70 ? -5 : 0;

    const artistCount = artistCounts.get(album.artist) ?? 0;
    if (artistCount >= 2) score -= 15;
    artistCounts.set(album.artist, artistCount + 1);

    vinyl.spotifyAlbumId = album.id;
    vinyl.spotifyUrl = album.spotifyUrl;
    vinyl.score = score;
    vinyl.reasons = buildReasons(vinyl, profile, matchedArtist ?? null);

    results.push(vinyl);

    await new Promise((r) => setTimeout(r, 1100));
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
