import type {
  SpotifyAlbum,
  SpotifyArtist,
  SpotifyListeningSnapshot,
  SpotifyRecentlyPlayed,
  SpotifyTimeRange,
  SpotifyTopByTerm,
  SpotifyTrack,
} from "@/lib/types";

const SPOTIFY_API = "https://api.spotify.com/v1";

type SpotifyAlbumPayload = {
  id: string;
  name: string;
  release_date: string;
  external_urls: { spotify: string };
  images: { url: string }[];
  artists: { id: string; name: string }[];
  album_type?: string;
};

type SpotifyTrackPayload = {
  id: string;
  name: string;
  external_urls: { spotify: string };
  artists: { id: string; name: string }[];
  album: SpotifyAlbumPayload;
};

function mapSpotifyAlbum(album: SpotifyAlbumPayload): SpotifyAlbum {
  return {
    id: album.id,
    name: album.name,
    artist: album.artists[0]?.name ?? "Unknown",
    artistId: album.artists[0]?.id ?? "",
    releaseDate: album.release_date,
    imageUrl: album.images[0]?.url ?? null,
    spotifyUrl: album.external_urls.spotify,
  };
}

function mapSpotifyTrack(track: SpotifyTrackPayload): SpotifyTrack {
  return {
    id: track.id,
    name: track.name,
    artist: track.artists[0]?.name ?? "Unknown",
    artistId: track.artists[0]?.id ?? "",
    albumId: track.album.id,
    albumName: track.album.name,
    spotifyUrl: track.external_urls.spotify,
  };
}

async function spotifyFetch<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify API error: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

async function spotifyPaginate<T>(
  path: string,
  accessToken: string,
  extract: (data: Record<string, unknown>) => T[],
  maxPages = 3,
): Promise<T[]> {
  const results: T[] = [];
  let nextUrl: string | null = `${SPOTIFY_API}${path}`;

  for (let page = 0; page < maxPages && nextUrl; page++) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) break;

    const data = (await res.json()) as Record<string, unknown>;
    results.push(...extract(data));
    nextUrl = (data.next as string | null) ?? null;
  }

  return results;
}

export async function fetchTopArtists(
  accessToken: string,
  limit = 20,
  timeRange: SpotifyTimeRange = "medium_term",
): Promise<SpotifyArtist[]> {
  const data = await spotifyFetch<{
    items: {
      id: string;
      name: string;
      genres: string[];
      popularity: number;
    }[];
  }>(`/me/top/artists?limit=${limit}&time_range=${timeRange}`, accessToken);

  return data.items.map((a) => ({
    id: a.id,
    name: a.name,
    genres: a.genres,
    popularity: a.popularity,
  }));
}

export async function fetchTopArtistsByTerm(
  accessToken: string,
  limit = 20,
): Promise<SpotifyTopByTerm<SpotifyArtist>> {
  const [short, medium, long] = await Promise.all([
    fetchTopArtists(accessToken, limit, "short_term"),
    fetchTopArtists(accessToken, limit, "medium_term"),
    fetchTopArtists(accessToken, limit, "long_term"),
  ]);
  return { short, medium, long };
}

export async function fetchTopTracks(
  accessToken: string,
  limit = 50,
  timeRange: SpotifyTimeRange = "medium_term",
): Promise<SpotifyTrack[]> {
  const data = await spotifyFetch<{ items: SpotifyTrackPayload[] }>(
    `/me/top/tracks?limit=${limit}&time_range=${timeRange}`,
    accessToken,
  );

  return data.items.map(mapSpotifyTrack);
}

export async function fetchTopTracksByTerm(
  accessToken: string,
  limit = 50,
): Promise<SpotifyTopByTerm<SpotifyTrack>> {
  const [short, medium, long] = await Promise.all([
    fetchTopTracks(accessToken, limit, "short_term"),
    fetchTopTracks(accessToken, limit, "medium_term"),
    fetchTopTracks(accessToken, limit, "long_term"),
  ]);
  return { short, medium, long };
}

export async function fetchTopAlbums(
  accessToken: string,
  limit = 20,
): Promise<SpotifyAlbum[]> {
  const tracks = await fetchTopTracks(accessToken, 50, "medium_term");

  const seen = new Set<string>();
  const albums: SpotifyAlbum[] = [];

  for (const track of tracks) {
    if (seen.has(track.albumId)) continue;
    seen.add(track.albumId);
    albums.push({
      id: track.albumId,
      name: track.albumName,
      artist: track.artist,
      artistId: track.artistId,
      releaseDate: "",
      imageUrl: null,
      spotifyUrl: track.spotifyUrl.replace(/\/track\//, "/album/"),
    });
    if (albums.length >= limit) break;
  }

  return albums;
}

export async function fetchRecentlyPlayed(
  accessToken: string,
  limit = 50,
): Promise<SpotifyRecentlyPlayed[]> {
  const data = await spotifyFetch<{
    items: { track: SpotifyTrackPayload; played_at: string }[];
  }>(`/me/player/recently-played?limit=${limit}`, accessToken);

  return data.items.map((item) => ({
    track: mapSpotifyTrack(item.track),
    playedAt: item.played_at,
  }));
}

export async function fetchSavedAlbums(
  accessToken: string,
  maxItems = 100,
): Promise<SpotifyAlbum[]> {
  const items = await spotifyPaginate(
    `/me/albums?limit=50`,
    accessToken,
    (data) => (data.items as { album: SpotifyAlbumPayload }[]) ?? [],
    Math.ceil(maxItems / 50),
  );

  return items
    .map((item) => item.album)
    .filter((album) => album.album_type !== "single")
    .slice(0, maxItems)
    .map(mapSpotifyAlbum);
}

export async function fetchSavedTracks(
  accessToken: string,
  maxItems = 100,
): Promise<SpotifyTrack[]> {
  const items = await spotifyPaginate(
    `/me/tracks?limit=50`,
    accessToken,
    (data) => (data.items as { track: SpotifyTrackPayload }[]) ?? [],
    Math.ceil(maxItems / 50),
  );

  return items.map((item) => mapSpotifyTrack(item.track)).slice(0, maxItems);
}

/** Fetches all listening signals and assembles a full snapshot. */
export async function fetchFullListeningSnapshot(
  accessToken: string,
): Promise<SpotifyListeningSnapshot> {
  const [
    topArtists,
    topTracks,
    savedAlbums,
    savedTracks,
    recentlyPlayed,
  ] = await Promise.all([
    fetchTopArtistsByTerm(accessToken),
    fetchTopTracksByTerm(accessToken),
    fetchSavedAlbums(accessToken),
    fetchSavedTracks(accessToken),
    fetchRecentlyPlayed(accessToken),
  ]);

  const topGenres = deriveTopGenres(topArtists.medium);

  return {
    topArtists,
    topTracks,
    savedAlbums,
    savedTracks,
    recentlyPlayed,
    topGenres,
    fetchedAt: new Date(),
  };
}

export function deriveTopGenres(artists: SpotifyArtist[]): string[] {
  const counts = new Map<string, number>();
  for (const artist of artists) {
    for (const genre of artist.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([genre]) => genre);
}

async function fetchArtistAlbums(
  accessToken: string,
  artistId: string,
  limit = 10,
): Promise<SpotifyAlbum[]> {
  const data = await spotifyFetch<{ items: SpotifyAlbumPayload[] }>(
    `/artists/${artistId}/albums?include_groups=album&limit=${limit}`,
    accessToken,
  );

  return data.items
    .filter((album) => album.album_type !== "single")
    .map(mapSpotifyAlbum);
}

async function searchAlbumsByGenre(
  accessToken: string,
  genre: string,
  limit = 10,
): Promise<SpotifyAlbum[]> {
  const q = encodeURIComponent(`genre:${genre}`);
  const data = await spotifyFetch<{ albums: { items: SpotifyAlbumPayload[] } }>(
    `/search?q=${q}&type=album&limit=${limit}`,
    accessToken,
  );

  return data.albums.items.map(mapSpotifyAlbum);
}

async function searchAlbumsByArtist(
  accessToken: string,
  artistName: string,
  limit = 5,
): Promise<SpotifyAlbum[]> {
  const q = encodeURIComponent(`artist:"${artistName}"`);
  const data = await spotifyFetch<{ albums: { items: SpotifyAlbumPayload[] } }>(
    `/search?q=${q}&type=album&limit=${limit}`,
    accessToken,
  );

  return data.albums.items
    .filter((album) => album.album_type !== "single")
    .map(mapSpotifyAlbum);
}

export interface DiscoverySeeds {
  artists?: SpotifyArtist[];
  genres?: string[];
  similarArtists?: string[];
  savedAlbumArtists?: SpotifyArtist[];
  trendingArtists?: SpotifyArtist[];
  coreArtists?: SpotifyArtist[];
}

/** Spotify removed /recommendations for new apps — use artist albums + search
 * instead. Seeds from saved albums, trending artists, and core artists improve
 * accuracy beyond generic genre search. */
export async function fetchDiscoveryAlbums(
  accessToken: string,
  seeds: DiscoverySeeds,
  limit = 30,
): Promise<SpotifyAlbum[]> {
  const seen = new Set<string>();
  const albums: SpotifyAlbum[] = [];

  function add(next: SpotifyAlbum[], cap?: number) {
    let added = 0;
    for (const album of next) {
      if (albums.length >= limit) return;
      if (cap !== undefined && added >= cap) return;
      if (seen.has(album.id)) continue;
      seen.add(album.id);
      albums.push(album);
      added++;
    }
  }

  // Saved albums' artists — high-confidence familiar picks.
  for (const artist of seeds.savedAlbumArtists?.slice(0, 3) ?? []) {
    if (albums.length >= limit) break;
    try {
      add(await fetchArtistAlbums(accessToken, artist.id, 6), 2);
    } catch {
      // continue
    }
  }

  // Trending artists — what they're into right now.
  for (const artist of seeds.trendingArtists?.slice(0, 3) ?? []) {
    if (albums.length >= limit) break;
    try {
      add(await fetchArtistAlbums(accessToken, artist.id, 6), 2);
    } catch {
      // continue
    }
  }

  // Core artists — deep catalog discovery from long-term favorites.
  for (const artist of seeds.coreArtists?.slice(0, 3) ?? []) {
    if (albums.length >= limit) break;
    try {
      add(await fetchArtistAlbums(accessToken, artist.id, 8), 3);
    } catch {
      // continue
    }
  }

  const ownCap = Math.ceil(limit * 0.3);
  for (const artist of seeds.artists?.slice(0, 3) ?? []) {
    if (albums.length >= ownCap) break;
    try {
      add(await fetchArtistAlbums(accessToken, artist.id, 6), ownCap - albums.length);
    } catch {
      // continue
    }
  }

  for (const name of seeds.similarArtists?.slice(0, 8) ?? []) {
    if (albums.length >= limit) break;
    try {
      add(await searchAlbumsByArtist(accessToken, name, 3), 2);
    } catch {
      // continue
    }
  }

  if (albums.length < limit) {
    try {
      add(await fetchTopAlbums(accessToken, 15));
    } catch {
      // continue
    }
  }

  for (const genre of seeds.genres?.slice(0, 3) ?? []) {
    if (albums.length >= limit) break;
    try {
      add(await searchAlbumsByGenre(accessToken, genre, 10));
    } catch {
      // continue
    }
  }

  return albums.slice(0, limit);
}

export async function fetchRecommendations(
  accessToken: string,
  seeds: { artists?: string[]; genres?: string[] },
  limit = 30,
): Promise<SpotifyAlbum[]> {
  const artists =
    seeds.artists?.map((id) => ({
      id,
      name: "",
      genres: [],
      popularity: 0,
    })) ?? [];

  return fetchDiscoveryAlbums(
    accessToken,
    { artists, genres: seeds.genres },
    limit,
  );
}

export async function searchSpotifyAlbum(
  accessToken: string,
  artist: string,
  title: string,
): Promise<SpotifyAlbum | null> {
  const q = encodeURIComponent(`album:${title} artist:${artist}`);
  const data = await spotifyFetch<{ albums: { items: SpotifyAlbumPayload[] } }>(
    `/search?q=${q}&type=album&limit=1`,
    accessToken,
  );

  const album = data.albums.items[0];
  if (!album) return null;

  return mapSpotifyAlbum(album);
}
