import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPlaylistLibrary } from "@/lib/spotify/client";

function trackPayload(id: string) {
  return {
    id,
    name: `Track ${id}`,
    external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    artists: [{ id: `artist-${id}`, name: `Artist ${id}` }],
    album: { id: `album-${id}`, name: `Album ${id}` },
  };
}

/** Routes a mocked fetch by substring match on the URL — playlist import
 * hits two different endpoints (/me/playlists, /playlists/{id}/tracks), each
 * needing its own response shape. */
function mockFetchByUrl(handler: (url: string) => { ok: boolean; body?: unknown }) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    const { ok, body } = handler(url);
    return {
      ok,
      text: async () => JSON.stringify(body ?? {}),
      json: async () => body ?? {},
    } as Response;
  });
}

describe("fetchPlaylistLibrary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("dedupes tracks that appear in more than one playlist", async () => {
    mockFetchByUrl((url) => {
      if (url.includes("/me/playlists")) {
        return {
          ok: true,
          body: { items: [{ id: "p1", name: "P1" }, { id: "p2", name: "P2" }], next: null },
        };
      }
      if (url.includes("/playlists/p1/tracks")) {
        return { ok: true, body: { items: [{ track: trackPayload("t1") }, { track: trackPayload("t2") }] } };
      }
      if (url.includes("/playlists/p2/tracks")) {
        return { ok: true, body: { items: [{ track: trackPayload("t1") }, { track: trackPayload("t3") }] } };
      }
      return { ok: true, body: { items: [] } };
    });

    const tracks = await fetchPlaylistLibrary("token");
    expect(tracks.map((t) => t.id).sort()).toEqual(["t1", "t2", "t3"]);
  });

  it("filters out null tracks (local files / removed tracks)", async () => {
    mockFetchByUrl((url) => {
      if (url.includes("/me/playlists")) {
        return { ok: true, body: { items: [{ id: "p1", name: "P1" }], next: null } };
      }
      return { ok: true, body: { items: [{ track: null }, { track: trackPayload("t1") }] } };
    });

    const tracks = await fetchPlaylistLibrary("token");
    expect(tracks.map((t) => t.id)).toEqual(["t1"]);
  });

  it("skips a playlist whose track fetch fails, keeping tracks from the rest", async () => {
    mockFetchByUrl((url) => {
      if (url.includes("/me/playlists")) {
        return {
          ok: true,
          body: { items: [{ id: "p1", name: "P1" }, { id: "p2", name: "P2" }], next: null },
        };
      }
      if (url.includes("/playlists/p1/tracks")) {
        return { ok: false, body: { error: "boom" } };
      }
      return { ok: true, body: { items: [{ track: trackPayload("t1") }] } };
    });

    const tracks = await fetchPlaylistLibrary("token");
    expect(tracks.map((t) => t.id)).toEqual(["t1"]);
  });

  it("returns an empty array, not throwing, when the user has no playlists", async () => {
    mockFetchByUrl(() => ({ ok: true, body: { items: [], next: null } }));

    const tracks = await fetchPlaylistLibrary("token");
    expect(tracks).toEqual([]);
  });

  it("caps playlists fetched at 20, ignoring the rest of a larger library", async () => {
    const playlists = Array.from({ length: 25 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    let tracksFetchCount = 0;

    mockFetchByUrl((url) => {
      if (url.includes("/me/playlists")) {
        return { ok: true, body: { items: playlists, next: null } };
      }
      tracksFetchCount++;
      return { ok: true, body: { items: [{ track: trackPayload(url) }] } };
    });

    await fetchPlaylistLibrary("token");
    expect(tracksFetchCount).toBe(20);
  });
});
