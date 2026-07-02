import type { DiscogsRelease, Recommendation } from "@/lib/types";
import { createRateLimiter } from "@/lib/utils/rate-limited-pool";
import { getArtistTags, getCoverArt, searchReleaseGroup } from "@/lib/musicbrainz/client";
import { searchAlbum as searchAppleMusicAlbum } from "@/lib/apple-music/client";

const DISCOGS_API = "https://api.discogs.com";

/** Discogs allows ~60 requests/min for authenticated tokens — space calls at 1/sec. */
export const discogsThrottle = createRateLimiter(1000);

function discogsHeaders(): HeadersInit {
  const token = process.env.DISCOGS_TOKEN;
  return {
    Authorization: `Discogs token=${token}`,
    "User-Agent": "RecordFinder/1.0",
  };
}

async function discogsFetch<T>(path: string): Promise<T> {
  const res = await discogsThrottle(() =>
    fetch(`${DISCOGS_API}${path}`, {
      headers: discogsHeaders(),
      next: { revalidate: 86400 },
    }),
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs API error: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function searchVinylRelease(
  artist: string,
  title: string,
): Promise<Recommendation | null> {
  const q = encodeURIComponent(`${artist} ${title}`);
  const data = await discogsFetch<{
    results: {
      id: number;
      title: string;
      year?: string;
      cover_image?: string;
      genre?: string[];
      style?: string[];
      community?: { want: number; have: number };
    }[];
  }>(
    `/database/search?q=${q}&type=release&format=Vinyl&per_page=5`,
  );

  const result = data.results[0];
  if (!result) return null;

  const [artistName, ...titleParts] = result.title.includes(" - ")
    ? result.title.split(" - ")
    : ["Unknown", result.title];

  return {
    discogsReleaseId: result.id,
    title: titleParts.join(" - ") || result.title,
    artist: artistName,
    year: result.year ? parseInt(result.year, 10) : null,
    coverUrl: result.cover_image ?? null,
    genres: [...(result.genre ?? []), ...(result.style ?? [])],
    communityRating: null,
    ratingCount: null,
    spotifyAlbumId: null,
    spotifyUrl: null,
    score: 0,
    reasons: [],
  };
}

export async function getMarketplaceStats(releaseId: number): Promise<{
  lowestPrice: number | null;
  currency: string;
  numForSale: number;
  discogsUrl: string;
} | null> {
  try {
    const data = await discogsFetch<{
      lowest_price?: number | null;
      num_for_sale?: number;
    }>(`/marketplace/stats/${releaseId}`);

    return {
      lowestPrice: data.lowest_price ?? null,
      currency: "USD",
      numForSale: data.num_for_sale ?? 0,
      discogsUrl: `https://www.discogs.com/sell/release/${releaseId}`,
    };
  } catch {
    return {
      lowestPrice: null,
      currency: "USD",
      numForSale: 0,
      discogsUrl: `https://www.discogs.com/sell/release/${releaseId}`,
    };
  }
}

export async function getRelease(id: number): Promise<DiscogsRelease | null> {
  try {
    const data = await discogsFetch<{
      id: number;
      title: string;
      year?: number;
      genres?: string[];
      styles?: string[];
      formats?: { name: string; descriptions?: string[] }[];
      tracklist?: { position: string; title: string; duration?: string }[];
      images?: { uri: string; type: string }[];
      community?: { rating: { average: number; count: number } };
      uri?: string;
    }>(`/releases/${id}`);

    const [artist, ...titleParts] = data.title.includes(" - ")
      ? data.title.split(" - ")
      : ["Unknown", data.title];

    const cover =
      data.images?.find((i) => i.type === "primary")?.uri ??
      data.images?.[0]?.uri ??
      null;

    const marketplace = await getMarketplaceStats(data.id);

    // Companion enrichment (not on the hot scoring path, so no rate pressure):
    // MusicBrainz genre tags, and a cover-art fallback chain if Discogs has none.
    const [mbGroup, mbTags, appleAlbum] = await Promise.all([
      searchReleaseGroup(artist, data.title).catch(() => null),
      getArtistTags(artist).catch(() => []),
      cover ? Promise.resolve(null) : searchAppleMusicAlbum(artist, data.title).catch(() => null),
    ]);

    let resolvedCover = cover;
    if (!resolvedCover && mbGroup?.mbid) {
      resolvedCover = await getCoverArt(mbGroup.mbid).catch(() => null);
    }
    if (!resolvedCover && appleAlbum?.artworkUrl) {
      resolvedCover = appleAlbum.artworkUrl;
    }

    return {
      id: data.id,
      title: titleParts.join(" - ") || data.title,
      artist,
      year: data.year ?? null,
      coverUrl: resolvedCover,
      genres: Array.from(new Set([...(data.genres ?? []), ...mbTags])),
      styles: data.styles ?? [],
      formats: (data.formats ?? []).map(
        (f) => `${f.name}${f.descriptions?.length ? ` (${f.descriptions.join(", ")})` : ""}`,
      ),
      tracklist: (data.tracklist ?? []).map((t) => ({
        position: t.position,
        title: t.title,
        duration: t.duration ?? "",
      })),
      communityRating: data.community?.rating?.average ?? null,
      ratingCount: data.community?.rating?.count ?? null,
      spotifyUrl: null,
      marketplace: marketplace ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function browseByGenreDecade(
  genres: string[],
  decades: string[],
  limit = 20,
): Promise<Recommendation[]> {
  const decadeYear = decades[0]?.replace("s", "") ?? "199";
  const genre = genres[0] ?? "Rock";
  const q = encodeURIComponent(`${genre} ${decadeYear}`);

  const data = await discogsFetch<{
    results: {
      id: number;
      title: string;
      year?: string;
      cover_image?: string;
      genre?: string[];
      style?: string[];
    }[];
  }>(
    `/database/search?q=${q}&type=release&format=Vinyl&per_page=${limit}&sort=want`,
  );

  return data.results.map((r) => {
    const [artistName, ...titleParts] = r.title.includes(" - ")
      ? r.title.split(" - ")
      : ["Unknown", r.title];

    return {
      discogsReleaseId: r.id,
      title: titleParts.join(" - ") || r.title,
      artist: artistName,
      year: r.year ? parseInt(r.year, 10) : null,
      coverUrl: r.cover_image ?? null,
      genres: [...(r.genre ?? []), ...(r.style ?? [])],
      communityRating: null,
      ratingCount: null,
      spotifyAlbumId: null,
      spotifyUrl: null,
      score: 0,
      reasons: [`Matches your ${genre} and ${decades[0] ?? "era"} preferences`],
    };
  });
}
