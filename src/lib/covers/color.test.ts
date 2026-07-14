import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { getCoverColorsForReleases } from "@/lib/covers/color";
import type { Recommendation } from "@/lib/types";

vi.mock("@/lib/db/queries", () => ({
  getCachedCoverColors: vi.fn(),
  cacheCoverColor: vi.fn().mockResolvedValue(undefined),
}));

import { getCachedCoverColors, cacheCoverColor } from "@/lib/db/queries";

function rec(overrides: Partial<Recommendation>): Recommendation {
  return {
    discogsReleaseId: 1,
    title: "Title",
    artist: "Artist",
    year: 1990,
    coverUrl: null,
    genres: [],
    formats: [],
    communityRating: null,
    ratingCount: null,
    wantCount: null,
    haveCount: null,
    spotifyAlbumId: null,
    spotifyUrl: null,
    score: 50,
    reasons: [],
    ...overrides,
  };
}

/** A solid-color PNG so the averaged "dominant color" is deterministic and
 * exactly matches the fill color — no need to reason about JPEG compression
 * artifacts or a real photo's actual average. */
async function solidColorPng(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 16, height: 16, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

describe("getCoverColorsForReleases", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns an empty map without touching the DB for recs with no cover", async () => {
    const result = await getCoverColorsForReleases([rec({ coverUrl: null })]);
    expect(result.size).toBe(0);
    expect(getCachedCoverColors).not.toHaveBeenCalled();
  });

  it("uses the DB cache and never fetches an image for a cached release", async () => {
    vi.mocked(getCachedCoverColors).mockResolvedValue(new Map([[1, "#112233"]]));
    global.fetch = vi.fn();

    const result = await getCoverColorsForReleases([
      rec({ discogsReleaseId: 1, coverUrl: "https://example.com/a.jpg" }),
    ]);

    expect(result.get(1)).toBe("#112233");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("extracts the average color from a solid-color cover on a cache miss and writes it back", async () => {
    vi.mocked(getCachedCoverColors).mockResolvedValue(new Map());
    const png = await solidColorPng(200, 100, 50);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    });

    const result = await getCoverColorsForReleases([
      rec({ discogsReleaseId: 2, coverUrl: "https://example.com/b.jpg" }),
    ]);

    expect(result.get(2)).toBe("#c86432");
    expect(cacheCoverColor).toHaveBeenCalledWith(2, "#c86432");
  });

  it("omits a release when the image fetch fails, and doesn't cache anything", async () => {
    vi.mocked(getCachedCoverColors).mockResolvedValue(new Map());
    global.fetch = vi.fn().mockResolvedValue({ ok: false });

    const result = await getCoverColorsForReleases([
      rec({ discogsReleaseId: 3, coverUrl: "https://example.com/c.jpg" }),
    ]);

    expect(result.has(3)).toBe(false);
    expect(cacheCoverColor).not.toHaveBeenCalled();
  });
});
