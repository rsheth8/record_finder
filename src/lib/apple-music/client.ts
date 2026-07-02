import { createRateLimiter } from "@/lib/utils/rate-limited-pool";

const ITUNES_API = "https://itunes.apple.com";

/** iTunes Search API has no published key but informally throttles around 20 req/min per IP. */
export const appleMusicThrottle = createRateLimiter(3000);

export interface AppleMusicAlbum {
  collectionId: number;
  artworkUrl: string | null;
  appleMusicUrl: string;
  releaseDate: string | null;
}

export async function searchAlbum(
  artist: string,
  title: string,
): Promise<AppleMusicAlbum | null> {
  const term = encodeURIComponent(`${artist} ${title}`);

  try {
    const res = await appleMusicThrottle(() =>
      fetch(
        `${ITUNES_API}/search?term=${term}&entity=album&limit=1`,
        { next: { revalidate: 86400 } },
      ),
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: {
        collectionId: number;
        artworkUrl100?: string;
        collectionViewUrl: string;
        releaseDate?: string;
      }[];
    };

    const hit = data.results?.[0];
    if (!hit) return null;

    return {
      collectionId: hit.collectionId,
      artworkUrl: hit.artworkUrl100
        ? hit.artworkUrl100.replace("100x100", "600x600")
        : null,
      appleMusicUrl: hit.collectionViewUrl,
      releaseDate: hit.releaseDate ?? null,
    };
  } catch {
    return null;
  }
}
