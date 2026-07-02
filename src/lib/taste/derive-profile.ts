import type {
  QuizAlbumPreference,
  SpotifyArtist,
  SpotifyListeningSnapshot,
  SpotifyTrack,
  TasteVector,
} from "@/lib/types";

const TERM_WEIGHTS = { short: 0.5, medium: 0.3, long: 0.2 } as const;
const RECENCY_DECAY_DAYS = 7;

function rankWeight(rank: number, listLength: number): number {
  if (listLength === 0) return 0;
  return (listLength - rank) / listLength;
}

function addWeight(
  map: Record<string, number>,
  key: string,
  weight: number,
) {
  if (weight <= 0) return;
  map[key] = Math.min(1, (map[key] ?? 0) + weight);
}

function collectArtistWeights(snapshot: SpotifyListeningSnapshot): Record<string, number> {
  const weights: Record<string, number> = {};

  for (const [term, artists] of Object.entries(snapshot.topArtists) as [
    keyof typeof TERM_WEIGHTS,
    SpotifyArtist[],
  ][]) {
    const termWeight = TERM_WEIGHTS[term];
    artists.forEach((artist, i) => {
      addWeight(weights, artist.id, rankWeight(i, artists.length) * termWeight);
    });
  }

  const savedArtistCounts = new Map<string, number>();
  for (const track of snapshot.savedTracks) {
    savedArtistCounts.set(
      track.artistId,
      (savedArtistCounts.get(track.artistId) ?? 0) + 1,
    );
  }
  const maxSaved = Math.max(1, ...savedArtistCounts.values());
  for (const [artistId, count] of savedArtistCounts) {
    addWeight(weights, artistId, (count / maxSaved) * 0.25);
  }

  const now = Date.now();
  const recentArtistCounts = new Map<string, { count: number; latest: number }>();
  for (const { track, playedAt } of snapshot.recentlyPlayed) {
    const played = new Date(playedAt).getTime();
    const daysAgo = (now - played) / (1000 * 60 * 60 * 24);
    if (daysAgo > RECENCY_DECAY_DAYS) continue;
    const decay = 1 - daysAgo / RECENCY_DECAY_DAYS;
    const existing = recentArtistCounts.get(track.artistId);
    if (existing) {
      existing.count += 1;
      existing.latest = Math.max(existing.latest, played);
    } else {
      recentArtistCounts.set(track.artistId, { count: 1, latest: played });
    }
    addWeight(weights, track.artistId, decay * 0.2);
  }

  return weights;
}

function collectAlbumWeights(
  snapshot: SpotifyListeningSnapshot,
  quizPreferences: QuizAlbumPreference[] = [],
): Record<string, number> {
  const weights: Record<string, number> = {};

  for (const album of snapshot.savedAlbums) {
    addWeight(weights, album.id, 1.0);
  }

  const albumFromTracks = new Map<string, { track: SpotifyTrack; rank: number }>();
  for (const [term, tracks] of Object.entries(snapshot.topTracks) as [
    keyof typeof TERM_WEIGHTS,
    SpotifyTrack[],
  ][]) {
    const termWeight = TERM_WEIGHTS[term];
    tracks.forEach((track, i) => {
      const w = rankWeight(i, tracks.length) * termWeight * 0.6;
      const existing = albumFromTracks.get(track.albumId);
      if (!existing || w > existing.rank) {
        albumFromTracks.set(track.albumId, { track, rank: w });
      }
    });
  }
  for (const [albumId, { rank }] of albumFromTracks) {
    addWeight(weights, albumId, rank);
  }

  const now = Date.now();
  const recentAlbums = new Set<string>();
  for (const { track, playedAt } of snapshot.recentlyPlayed) {
    const daysAgo =
      (now - new Date(playedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo <= RECENCY_DECAY_DAYS) {
      recentAlbums.add(track.albumId);
      const decay = 1 - daysAgo / RECENCY_DECAY_DAYS;
      addWeight(weights, track.albumId, decay * 0.5);
    }
  }

  for (const pref of quizPreferences) {
    addWeight(weights, pref.winnerAlbumId, 0.9);
    addWeight(weights, pref.loserAlbumId, 0.1);
  }

  return weights;
}

function collectGenreWeights(snapshot: SpotifyListeningSnapshot): Record<string, number> {
  const weights: Record<string, number> = {};

  const allArtists: SpotifyArtist[] = [
    ...snapshot.topArtists.short,
    ...snapshot.topArtists.medium,
    ...snapshot.topArtists.long,
  ];
  const seen = new Set<string>();
  for (const artist of allArtists) {
    if (seen.has(artist.id)) continue;
    seen.add(artist.id);
    for (const genre of artist.genres) {
      const key = genre.toLowerCase();
      addWeight(weights, key, 0.15);
    }
  }

  for (const genre of snapshot.topGenres) {
    addWeight(weights, genre.toLowerCase(), 0.2);
  }

  return weights;
}

function identifyCoreAndTrending(snapshot: SpotifyListeningSnapshot): {
  coreArtistIds: string[];
  trendingArtistIds: string[];
} {
  const shortIds = new Set(snapshot.topArtists.short.map((a) => a.id));
  const mediumIds = new Set(snapshot.topArtists.medium.map((a) => a.id));
  const longIds = new Set(snapshot.topArtists.long.map((a) => a.id));

  const coreArtistIds = [...longIds, ...mediumIds].filter(
    (id) => longIds.has(id) || mediumIds.has(id),
  ).filter((id) => !shortIds.has(id));
  const uniqueCore = [...new Set(coreArtistIds)];

  const trendingArtistIds = [...shortIds].filter(
    (id) => !longIds.has(id) && !mediumIds.has(id),
  );

  return { coreArtistIds: uniqueCore, trendingArtistIds };
}

export function deriveTasteProfile(
  snapshot: SpotifyListeningSnapshot,
  quizPreferences: QuizAlbumPreference[] = [],
): TasteVector {
  const artistWeights = collectArtistWeights(snapshot);
  const albumWeights = collectAlbumWeights(snapshot, quizPreferences);
  const genreWeights = collectGenreWeights(snapshot);
  const { coreArtistIds, trendingArtistIds } = identifyCoreAndTrending(snapshot);

  return {
    artistWeights,
    albumWeights,
    genreWeights,
    coreArtistIds,
    trendingArtistIds,
    derivedAt: new Date().toISOString(),
  };
}

export function getTopWeightedGenres(
  tasteVector: TasteVector,
  limit = 5,
): string[] {
  return Object.entries(tasteVector.genreWeights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre]) => genre);
}

export function artistsFromIds(
  ids: string[],
  ...sources: SpotifyArtist[][]
): SpotifyArtist[] {
  const byId = new Map<string, SpotifyArtist>();
  for (const list of sources) {
    for (const artist of list) {
      byId.set(artist.id, artist);
    }
  }
  return ids.map((id) => byId.get(id)).filter((a): a is SpotifyArtist => !!a);
}
