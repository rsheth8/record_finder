import type { SpotifyAlbum, SpotifyArtist } from "@/lib/types";

const SPOTIFY_API = "https://api.spotify.com/v1";

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
    items: {
      album: {
        id: string;
        name: string;
        release_date: string;
        external_urls: { spotify: string };
        images: { url: string }[];
        artists: { id: string; name: string }[];
      };
    }[];
  }>(`/me/top/tracks?limit=50&time_range=medium_term`, accessToken);

  const seen = new Set<string>();
  const albums: SpotifyAlbum[] = [];

  for (const item of tracksData.items) {
    const a = item.album;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    albums.push({
      id: a.id,
      name: a.name,
      artist: a.artists[0]?.name ?? "Unknown",
      artistId: a.artists[0]?.id ?? "",
      releaseDate: a.release_date,
      imageUrl: a.images[0]?.url ?? null,
      spotifyUrl: a.external_urls.spotify,
    });
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

export async function fetchRecommendations(
  accessToken: string,
  seeds: { artists?: string[]; genres?: string[] },
  limit = 30,
): Promise<SpotifyAlbum[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (seeds.artists?.length) {
    params.set("seed_artists", seeds.artists.slice(0, 5).join(","));
  }
  if (seeds.genres?.length) {
    params.set("seed_genres", seeds.genres.slice(0, 5).join(","));
  }

  if (!params.has("seed_artists") && !params.has("seed_genres")) {
    return [];
  }

  const data = await spotifyFetch<{
    tracks: {
      album: {
        id: string;
        name: string;
        release_date: string;
        external_urls: { spotify: string };
        images: { url: string }[];
        artists: { id: string; name: string }[];
      };
    }[];
  }>(`/recommendations?${params}`, accessToken);

  const seen = new Set<string>();
  const albums: SpotifyAlbum[] = [];

  for (const track of data.tracks) {
    const album = track.album;
    if (seen.has(album.id)) continue;
    seen.add(album.id);
    albums.push({
      id: album.id,
      name: album.name,
      artist: album.artists[0]?.name ?? "Unknown",
      artistId: album.artists[0]?.id ?? "",
      releaseDate: album.release_date,
      imageUrl: album.images[0]?.url ?? null,
      spotifyUrl: album.external_urls.spotify,
    });
  }

  return albums;
}

export async function searchSpotifyAlbum(
  accessToken: string,
  artist: string,
  title: string,
): Promise<SpotifyAlbum | null> {
  const q = encodeURIComponent(`album:${title} artist:${artist}`);
  const data = await spotifyFetch<{
    albums: {
      items: {
        id: string;
        name: string;
        release_date: string;
        external_urls: { spotify: string };
        images: { url: string }[];
        artists: { id: string; name: string }[];
      }[];
    };
  }>(`/search?q=${q}&type=album&limit=1`, accessToken);

  const album = data.albums.items[0];
  if (!album) return null;

  return {
    id: album.id,
    name: album.name,
    artist: album.artists[0]?.name ?? artist,
    artistId: album.artists[0]?.id ?? "",
    releaseDate: album.release_date,
    imageUrl: album.images[0]?.url ?? null,
    spotifyUrl: album.external_urls.spotify,
  };
}
