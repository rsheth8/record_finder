import sharp from "sharp";
import type { Recommendation } from "@/lib/types";
import { getCachedCoverColors, cacheCoverColor } from "@/lib/db/queries";

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

/** Downsamples a cover image to a handful of pixels and averages them into
 * one hex color — a cheap "dominant color" approximation (no clustering),
 * which is all a poster glow/vinyl-label tint needs. Never throws: a bad
 * URL, a non-image response, or a decode failure all just mean no tint. */
async function extractDominantColor(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    const { data, info } = await sharp(buffer)
      .resize(8, 8, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let r = 0;
    let g = 0;
    let b = 0;
    const pixelCount = info.width * info.height;
    for (let i = 0; i < data.length; i += info.channels) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }

    return `#${toHex(r / pixelCount)}${toHex(g / pixelCount)}${toHex(b / pixelCount)}`;
  } catch {
    return null;
  }
}

/** Batch-computes each release's average cover-art color, keyed by
 * `discogsReleaseId`. DB-cached indefinitely (see `coverColorCache`) since
 * cover art doesn't change once released — unlike price/rating enrichment,
 * there's no TTL to re-check. Misses run in parallel: this isn't a Discogs
 * API call, so it isn't subject to `discogsThrottle`. */
export async function getCoverColorsForReleases(
  recommendations: Recommendation[],
): Promise<Map<number, string>> {
  const withCovers = recommendations.filter(
    (r): r is Recommendation & { coverUrl: string } => Boolean(r.coverUrl),
  );
  if (withCovers.length === 0) return new Map();

  const cached = await getCachedCoverColors(withCovers.map((r) => r.discogsReleaseId));
  const result = new Map(cached);

  const misses = withCovers.filter((r) => !cached.has(r.discogsReleaseId));

  await Promise.all(
    misses.map(async (rec) => {
      const color = await extractDominantColor(rec.coverUrl);
      if (!color) return;
      result.set(rec.discogsReleaseId, color);
      void cacheCoverColor(rec.discogsReleaseId, color).catch(() => {});
    }),
  );

  return result;
}
