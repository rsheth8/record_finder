import { createRateLimiter } from "@/lib/utils/rate-limited-pool";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

/** No hard published cap; ~5 req/sec is a safe sustained budget. */
export const lastfmThrottle = createRateLimiter(200);

export const isLastfmConfigured = Boolean(process.env.LASTFM_API_KEY);

async function lastfmFetch<T>(
  method: string,
  params: Record<string, string>,
): Promise<T | null> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return null;

  const query = new URLSearchParams({
    method,
    api_key: apiKey,
    format: "json",
    ...params,
  });

  try {
    const res = await lastfmThrottle(() =>
      fetch(`${LASTFM_API}?${query}`, { next: { revalidate: 86400 } }),
    );
    if (!res.ok) return null;
    const data = (await res.json()) as T & { error?: number };
    if (data.error) return null;
    return data;
  } catch {
    return null;
  }
}

export interface SimilarArtist {
  name: string;
  match: number;
}

export async function getSimilarArtists(
  artist: string,
  limit = 10,
): Promise<SimilarArtist[]> {
  const data = await lastfmFetch<{
    similarartists?: { artist?: { name: string; match: string }[] };
  }>("artist.getsimilar", { artist, limit: String(limit), autocorrect: "1" });

  return (data?.similarartists?.artist ?? []).map((a) => ({
    name: a.name,
    match: Number(a.match),
  }));
}

export async function getArtistTopTags(artist: string): Promise<string[]> {
  const data = await lastfmFetch<{
    toptags?: { tag?: { name: string }[] };
  }>("artist.gettoptags", { artist, autocorrect: "1" });

  return (data?.toptags?.tag ?? []).slice(0, 10).map((t) => t.name);
}

export async function getAlbumInfo(
  artist: string,
  album: string,
): Promise<{ tags: string[]; playcount: number | null } | null> {
  const data = await lastfmFetch<{
    album?: { tags?: { tag?: { name: string }[] }; playcount?: string };
  }>("album.getinfo", { artist, album, autocorrect: "1" });

  if (!data?.album) return null;

  return {
    tags: (data.album.tags?.tag ?? []).map((t) => t.name),
    playcount: data.album.playcount ? Number(data.album.playcount) : null,
  };
}
