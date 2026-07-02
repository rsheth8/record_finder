import { createRateLimiter } from "@/lib/utils/rate-limited-pool";

const MB_API = "https://musicbrainz.org/ws/2";
const COVER_ART_API = "https://coverartarchive.org";

/** MusicBrainz hard-enforces 1 request/second per IP. */
export const musicbrainzThrottle = createRateLimiter(1000);

function mbHeaders(): HeadersInit {
  return {
    "User-Agent": "RecordFinder/1.0 (+https://github.com/record-finder)",
    Accept: "application/json",
  };
}

async function mbFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await musicbrainzThrottle(() =>
      fetch(`${MB_API}${path}`, {
        headers: mbHeaders(),
        next: { revalidate: 604800 },
      }),
    );
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface MusicBrainzReleaseGroup {
  mbid: string;
  title: string;
  firstReleaseDate: string | null;
  primaryType: string | null;
  tags: string[];
}

export async function searchReleaseGroup(
  artist: string,
  title: string,
): Promise<MusicBrainzReleaseGroup | null> {
  const query = encodeURIComponent(
    `artist:"${artist}" AND releasegroup:"${title}"`,
  );
  const data = await mbFetch<{
    "release-groups"?: {
      id: string;
      title: string;
      "first-release-date"?: string;
      "primary-type"?: string;
      tags?: { name: string }[];
    }[];
  }>(`/release-group/?query=${query}&fmt=json&limit=1`);

  const group = data?.["release-groups"]?.[0];
  if (!group) return null;

  return {
    mbid: group.id,
    title: group.title,
    firstReleaseDate: group["first-release-date"] ?? null,
    primaryType: group["primary-type"] ?? null,
    tags: (group.tags ?? []).map((t) => t.name),
  };
}

export async function getArtistTags(artist: string): Promise<string[]> {
  const query = encodeURIComponent(`artist:"${artist}"`);
  const data = await mbFetch<{
    artists?: { tags?: { name: string }[] }[];
  }>(`/artist/?query=${query}&fmt=json&limit=1`);

  return (data?.artists?.[0]?.tags ?? []).map((t) => t.name);
}

export async function getCoverArt(releaseGroupMbid: string): Promise<string | null> {
  try {
    const res = await musicbrainzThrottle(() =>
      fetch(`${COVER_ART_API}/release-group/${releaseGroupMbid}`, {
        next: { revalidate: 604800 },
      }),
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      images?: { front?: boolean; thumbnails?: { large?: string }; image?: string }[];
    };
    const front = data.images?.find((i) => i.front) ?? data.images?.[0];
    return front?.thumbnails?.large ?? front?.image ?? null;
  } catch {
    return null;
  }
}
