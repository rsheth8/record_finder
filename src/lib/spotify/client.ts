import type { SpotifyAlbum, SpotifyArtist } from "@/lib/types";

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

export async function fetchTopArtists(
  accessToken: string,
  limit = 20,
): Promise<SpotifyArtist[]> {
  const data = await spotifyFetch<{
    items: {
      id: string;
      name: string;
      genres: string[];
      popularity: number;
    }[];
  }>(`/me/top/artists?limit=${limit}&time_range=medium_term`, accessToken);

  return data.items.map((a) => ({
    id: a.id,
    name: a.name,
    genres: a.genres,
    popularity: a.popularity,
  }));
}

export async function fetchTopAlbums(
  accessToken: string,
  limit = 20,
): Promise<SpotifyAlbum[]> {
  const tracksData = await spotifyFetch<{
    items: { album: SpotifyAlbumPayload }[];
  }>(`/me/top/tracks?limit=50&time_range=medium_term`, accessToken);

  const seen = new Set<string>();
  const albums: SpotifyAlbum[] = [];

  for (const item of tracksData.items) {
    const album = item.album;
    if (seen.has(album.id)) continue;
    seen.add(album.id);
    albums.push(mapSpotifyAlbum(album));
    if (albums.length >= limit) break;
  }

  return albums;
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

/** Spotify removed /recommendations for new apps — use artist albums + search
 * instead. The pool is deliberately balanced so it's not just "more of what you
 * already play": familiar (own top artists) is capped to a minority, and a chunk
 * is reserved for Last.fm similar artists the user does not already listen to. */
export async function fetchDiscoveryAlbums(
  accessToken: string,
  seeds: {
    artists?: SpotifyArtist[];
    genres?: string[];
    similarArtists?: string[];
  },
  limit = 30,
): Promise<SpotifyAlbum[]> {
  const seen = new Set<string>();
  const albums: SpotifyAlbum[] = [];

  /** Adds up to `cap` new albums from `next` (unbounded when `cap` is omitted),
   * always respecting the overall `limit`. */
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

  // Familiar: albums from the user's own top artists, capped to a minority.
  const ownCap = Math.ceil(limit * 0.4);
  for (const artist of seeds.artists?.slice(0, 3) ?? []) {
    if (albums.length >= ownCap) break;
    try {
      add(await fetchArtistAlbums(accessToken, artist.id, 6), ownCap - albums.length);
    } catch {
      // Artist albums unavailable — continue with other sources.
    }
  }

  // Discovery: albums from Last.fm similar artists (new-to-you artists).
  for (const name of seeds.similarArtists?.slice(0, 8) ?? []) {
    if (albums.length >= limit) break;
    try {
      add(await searchAlbumsByArtist(accessToken, name, 3), 2);
    } catch {
      // Artist search failed — try the next similar artist.
    }
  }

  if (albums.length < limit) {
    try {
      add(await fetchTopAlbums(accessToken, 15));
    } catch {
      // Top tracks unavailable — continue with genre search.
    }
  }

  for (const genre of seeds.genres?.slice(0, 3) ?? []) {
    if (albums.length >= limit) break;
    try {
      add(await searchAlbumsByGenre(accessToken, genre, 10));
    } catch {
      // Genre search failed — try next genre.
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
