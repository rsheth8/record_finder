import type {
  DiscogsRelease,
  QuizDecade,
  QuizGenre,
  Recommendation,
  RecommendationMarketplace,
  SearchPagination,
} from "@/lib/types";
import { createRateLimiter } from "@/lib/utils/rate-limited-pool";
import { weightedSample } from "@/lib/utils/weighted-sample";
import { getArtistTags, getCoverArt, searchReleaseGroup } from "@/lib/musicbrainz/client";
import { searchAlbum as searchAppleMusicAlbum } from "@/lib/apple-music/client";
import {
  pickBestMatch,
  splitDiscogsTitle,
  type DiscogsSearchResult,
} from "@/lib/recommendations/match";
import { convertToUsd, roundUsd } from "@/lib/commerce/currency";
import { GENRE_DISCOGS_PARAM } from "@/lib/discogs/genre-map";
import { createTtlCache } from "@/lib/utils/ttl-cache";

const DISCOGS_API = "https://api.discogs.com";

/** Discogs allows ~60 requests/min for authenticated tokens — space calls at 1/sec. */
export const discogsThrottle = createRateLimiter(1000);

/** The account currency is a property of the token/account, not of any
 * particular release — cache it so every enrichment pass (one per Discover
 * row, one per Search page) doesn't spend a full throttled call re-deriving
 * the same value. A generous TTL is fine; it practically never changes. */
const accountCurrencyCache = createTtlCache<string, string>(60 * 60 * 1000);

/** Per-release enrichment (price/rating/want/have) is identical across every
 * row/page that happens to include the same release — and genre/decade/
 * most-wanted browse rows overlap heavily on popular titles. Caching this
 * lets a repeat appearance resolve instantly instead of waiting behind the
 * shared 1/sec throttle. `shouldCache` skips caching `null` (a failed fetch,
 * see `getReleaseEnrichment`) so a transient error retries next time instead
 * of leaving that release un-enriched for the full TTL. Keyed on currency too
 * (even though it's effectively constant) so a converted price is never
 * served under the wrong currency if that ever changes. */
const releaseEnrichmentCache = createTtlCache<
  string,
  Awaited<ReturnType<typeof fetchReleaseEnrichment>>
>(30 * 60 * 1000, { shouldCache: (v) => v !== null });

function discogsHeaders(): HeadersInit {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) {
    // Without this guard we'd send `Discogs token=undefined` and get a cryptic
    // 401 "Invalid consumer token" from the API. Fail with an actionable message.
    throw new Error(
      "DISCOGS_TOKEN is not set. Create a personal access token at " +
        "https://www.discogs.com/settings/developers and add it to .env.local, " +
        "then restart the dev server.",
    );
  }
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
  const data = await discogsFetch<{ results: DiscogsSearchResult[] }>(
    `/database/search?q=${q}&type=release&format=Vinyl&per_page=10`,
  );

  // Validate rather than trusting result[0]: Discogs keyword search happily
  // returns wrong pressings, bootlegs, and comps for a loose query.
  const result = pickBestMatch(artist, title, data.results ?? []);
  if (!result) return null;

  const parsed = splitDiscogsTitle(result.title);

  return {
    discogsReleaseId: result.id,
    title: parsed.title || result.title,
    artist: parsed.artist,
    year: result.year ? parseInt(result.year, 10) : null,
    coverUrl: result.cover_image ?? null,
    genres: [...(result.genre ?? []), ...(result.style ?? [])],
    formats: result.format ?? [],
    communityRating: null,
    ratingCount: null,
    wantCount: result.community?.want ?? null,
    haveCount: result.community?.have ?? null,
    spotifyAlbumId: null,
    spotifyUrl: null,
    score: 0,
    reasons: [],
  };
}

type DiscogsLowestPrice =
  | number
  | { value?: number | null; currency?: string }
  | null
  | undefined;

/** Discogs marketplace stats used to return lowest_price as a number; it now
 * returns { value, currency }. Accept both shapes so pricing stays numeric. */
function parseDiscogsLowestPrice(lowestPrice: DiscogsLowestPrice): {
  lowestPrice: number | null;
  currency: string;
} {
  if (lowestPrice == null) {
    return { lowestPrice: null, currency: "USD" };
  }

  if (typeof lowestPrice === "number") {
    return {
      lowestPrice: Number.isFinite(lowestPrice) ? lowestPrice : null,
      currency: "USD",
    };
  }

  const value = lowestPrice.value;
  return {
    lowestPrice: typeof value === "number" && Number.isFinite(value) ? value : null,
    currency: lowestPrice.currency ?? "USD",
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
      lowest_price?: DiscogsLowestPrice;
      num_for_sale?: number;
    }>(`/marketplace/stats/${releaseId}`);

    const { lowestPrice, currency } = parseDiscogsLowestPrice(data.lowest_price);
    const lowestPriceUsd =
      lowestPrice != null ? roundUsd(await convertToUsd(lowestPrice, currency)) : null;

    return {
      lowestPrice: lowestPriceUsd,
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

/** The token account's marketplace display currency (e.g. "EUR"), read from a
 * single marketplace/stats call. The release endpoint returns `lowest_price` as
 * a bare number in this currency, so we need it to convert those to USD. Sample
 * a release that's likely to have active listings; falls back to USD. Cached —
 * see `accountCurrencyCache` above. */
export async function getAccountCurrency(sampleReleaseId: number): Promise<string> {
  return accountCurrencyCache.get("account-currency", () =>
    fetchAccountCurrency(sampleReleaseId),
  );
}

async function fetchAccountCurrency(sampleReleaseId: number): Promise<string> {
  try {
    const data = await discogsFetch<{ lowest_price?: DiscogsLowestPrice }>(
      `/marketplace/stats/${sampleReleaseId}`,
    );
    const raw = data.lowest_price;
    if (raw && typeof raw === "object" && raw.currency) return raw.currency;
  } catch {
    // fall through to USD
  }
  return "USD";
}

/** One-shot enrichment for a recommendation: the `/releases/{id}` resource
 * carries community rating, want/have, and marketplace price + stock all at
 * once, so a single call fills everything the search endpoint left null —
 * crucially the community rating, which drives sorting, the rating filter, and
 * the ⭐ badge. `accountCurrency` converts the bare `lowest_price` to USD.
 * Cached — see `releaseEnrichmentCache` above. */
export async function getReleaseEnrichment(
  id: number,
  accountCurrency: string,
): ReturnType<typeof fetchReleaseEnrichment> {
  return releaseEnrichmentCache.get(`${id}:${accountCurrency}`, () =>
    fetchReleaseEnrichment(id, accountCurrency),
  );
}

async function fetchReleaseEnrichment(
  id: number,
  accountCurrency: string,
): Promise<{
  communityRating: number | null;
  ratingCount: number | null;
  wantCount: number | null;
  haveCount: number | null;
  marketplace: RecommendationMarketplace;
} | null> {
  try {
    const data = await discogsFetch<{
      num_for_sale?: number;
      lowest_price?: number | null;
      community?: {
        want?: number;
        have?: number;
        rating?: { average?: number; count?: number };
      };
    }>(`/releases/${id}`);

    const rawPrice = data.lowest_price;
    const lowestPrice =
      typeof rawPrice === "number" && Number.isFinite(rawPrice)
        ? roundUsd(await convertToUsd(rawPrice, accountCurrency))
        : null;

    return {
      communityRating: data.community?.rating?.average ?? null,
      ratingCount: data.community?.rating?.count ?? null,
      wantCount: data.community?.want ?? null,
      haveCount: data.community?.have ?? null,
      marketplace: {
        lowestPrice,
        currency: "USD",
        numForSale: data.num_for_sale ?? 0,
        discogsUrl: `https://www.discogs.com/sell/release/${id}`,
      },
    };
  } catch {
    return null;
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
      master_id?: number;
      notes?: string;
      identifiers?: { type: string; value: string; description?: string }[];
      companies?: { name: string; entity_type_name: string }[];
      extraartists?: { name: string; role: string }[];
      artists?: { name: string; join?: string }[];
    }>(`/releases/${id}`);

    // Unlike /database/search results (title formatted "Artist - Title", see
    // splitDiscogsTitle), /releases/{id} gives the artist separately via `artists`
    // and `title` is just the album title with no artist prefix to split on.
    // Each artist's `join` field is the separator before the *next* name
    // (e.g. "Simon" + join:"&" + "Garfunkel" -> "Simon & Garfunkel").
    const artist = data.artists?.length
      ? data.artists.reduce((acc, a, i) => {
          const name = a.name.replace(/\s\(\d+\)$/, "");
          if (i === 0) return name;
          const joiner = data.artists![i - 1].join?.trim();
          return `${acc}${joiner ? ` ${joiner} ` : ", "}${name}`;
        }, "")
      : "Unknown";

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
      title: data.title,
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
      masterId: data.master_id ?? null,
      notes: data.notes ?? null,
      identifiers: data.identifiers ?? [],
      companies: (data.companies ?? []).map((c) => ({
        name: c.name,
        entityTypeName: c.entity_type_name,
      })),
      extraArtists: (data.extraartists ?? []).map((a) => ({
        name: a.name,
        role: a.role,
      })),
    };
  } catch {
    return null;
  }
}

function searchResultToRecommendation(
  r: DiscogsSearchResult,
  reason: string,
): Recommendation {
  const parsed = splitDiscogsTitle(r.title);
  return {
    discogsReleaseId: r.id,
    title: parsed.title || r.title,
    artist: parsed.artist,
    year: r.year ? parseInt(r.year, 10) : null,
    coverUrl: r.cover_image ?? null,
    genres: [...(r.genre ?? []), ...(r.style ?? [])],
    formats: r.format ?? [],
    communityRating: null,
    ratingCount: null,
    wantCount: r.community?.want ?? null,
    haveCount: r.community?.have ?? null,
    spotifyAlbumId: null,
    spotifyUrl: null,
    score: 0,
    reasons: [reason],
  };
}

/** Same shape as searchResultToRecommendation, but for literal catalog search —
 * a search hit has no "reason" (that framing is for personalized picks), so this
 * stays a separate function rather than threading an empty/fake reason through. */
function searchResultToSearchHit(r: DiscogsSearchResult): Recommendation {
  const parsed = splitDiscogsTitle(r.title);
  return {
    discogsReleaseId: r.id,
    title: parsed.title || r.title,
    artist: parsed.artist,
    year: r.year ? parseInt(r.year, 10) : null,
    coverUrl: r.cover_image ?? null,
    genres: [...(r.genre ?? []), ...(r.style ?? [])],
    formats: r.format ?? [],
    communityRating: null,
    ratingCount: null,
    wantCount: r.community?.want ?? null,
    haveCount: r.community?.have ?? null,
    spotifyAlbumId: null,
    spotifyUrl: null,
    score: 0,
    reasons: [],
  };
}

// The base /database/search call itself costs the same one Discogs request
// regardless of per_page (up to Discogs' own ceiling), so this can be
// generous — the real cost lives downstream in enrichment, now a separate
// client-triggered POST /api/discogs/enrich call for a bounded subset of the
// page (see ENRICH_BATCH_SIZE in browse-row.tsx / search-feed.tsx), not here.
const SEARCH_PER_PAGE = 24;
const SEARCH_PAGE_MAX = 50;

export type SearchSortOption = "relevance" | "most_wanted" | "newest" | "oldest" | "artist_az";

/** Maps a UI sort choice to Discogs' real `sort`/`sort_order` query params —
 * each verified live against the real API (not assumed from docs): `sort=want`
 * genuinely orders by descending want count catalog-wide, `sort=year` by
 * release year, `sort=artist` alphabetically. "Relevance" omits the param
 * entirely (Discogs' own default ranking for a keyword query). */
function sortParams(sort: SearchSortOption): string {
  switch (sort) {
    case "most_wanted":
      return "&sort=want&sort_order=desc";
    case "newest":
      return "&sort=year&sort_order=desc";
    case "oldest":
      return "&sort=year&sort_order=asc";
    case "artist_az":
      return "&sort=artist&sort_order=asc";
    case "relevance":
    default:
      return "";
  }
}

/** Vinyl sub-formats offered as a search facet — the physical pressing sizes.
 * Discogs' search only honors ONE `format` param (a second is silently
 * ignored — verified live), so when one of these is chosen it *replaces*
 * `format=Vinyl` as the single facet. Deliberately limited to values that are
 * themselves vinyl-specific (LP / 12" / 10" / 7"), so dropping the explicit
 * `Vinyl` facet still returns only vinyl — verified live that each both
 * narrows the count and keeps every result vinyl. (EP / Box Set were dropped:
 * they aren't vinyl-exclusive, so as a lone facet they'd leak CDs.) */
export type SearchFormat = "LP" | '12"' | '10"' | '7"';

export const SEARCH_FORMATS: SearchFormat[] = ["LP", '12"', '10"', '7"'];

export interface SearchCatalogFilters {
  genre?: QuizGenre;
  /** Discogs has no decade-range search param (only an exact `year`), so this
   * is approximated the same way `browseByGenreDecade` does it — appended as
   * a keyword token to the query text rather than a precise filter. */
  decade?: QuizDecade;
  sort?: SearchSortOption;
  format?: SearchFormat;
}

/** Full-catalog vinyl search for the /search page — unlike searchVinylRelease
 * (which validates a single best match for scoring a known artist+title pair),
 * this returns a raw, paginated results list for an arbitrary free-text query.
 * `filters.genre`/`filters.sort` are real Discogs search params, so they
 * correctly narrow/order the *entire* catalog result set (and its pagination),
 * not just the current page. */
export async function searchCatalog(
  query: string,
  page = 1,
  filters: SearchCatalogFilters = {},
): Promise<{ results: Recommendation[]; pagination: SearchPagination }> {
  const clampedPage = Math.min(Math.max(1, page), SEARCH_PAGE_MAX);
  const decadeToken = filters.decade ? filters.decade.replace("s", "") : "";
  const q = encodeURIComponent(`${query.trim()} ${decadeToken}`.trim());

  const genreParam = filters.genre
    ? `&${GENRE_DISCOGS_PARAM[filters.genre].field}=${encodeURIComponent(
        GENRE_DISCOGS_PARAM[filters.genre].value,
      )}`
    : "";
  // The single honored format facet: a chosen vinyl sub-format (LP/12"/10"/7",
  // each itself vinyl) replaces the plain `Vinyl` facet — see SearchFormat.
  const formatFacet = filters.format ?? "Vinyl";
  const sort = sortParams(filters.sort ?? "relevance");

  const data = await discogsFetch<{
    results?: DiscogsSearchResult[];
    pagination?: { page: number; pages: number; items: number; per_page: number };
  }>(
    `/database/search?q=${q}&type=release&format=${encodeURIComponent(formatFacet)}${genreParam}${sort}&page=${clampedPage}&per_page=${SEARCH_PER_PAGE}`,
  );

  return {
    results: (data.results ?? []).map(searchResultToSearchHit),
    pagination: {
      page: data.pagination?.page ?? clampedPage,
      pages: data.pagination?.pages ?? 1,
      items: data.pagination?.items ?? data.results?.length ?? 0,
      perPage: data.pagination?.per_page ?? SEARCH_PER_PAGE,
    },
  };
}

/** Round-robins across per-source lists so the merged result alternates between
 * genres/eras instead of front-loading whichever query returned the most. Keeps
 * the top hits from each source near the front while spreading variety. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      if (i < list.length) out.push(list[i]);
    }
  }
  return out;
}

/** How much wider a pool to fetch per combo than we ultimately keep, so there's
 * room to sample variety from (bounded — Discogs allows per_page up to 100). */
const BROWSE_POOL_MULTIPLIER = 3;
const BROWSE_POOL_MAX = 50;

/** Quiz-only discovery. Rather than a single `genre[0] + decade[0]` search
 * (which collapses the whole feed onto one sound), fan out across the user's
 * top genres × eras, then interleave so the picks stay varied. Deduped by
 * release id here; cross-pressing dedupe happens downstream.
 *
 * Each combo's query is `sort=want`, so the raw top-N Discogs returns for a
 * given genre+decade barely changes day to day — "Refresh picks" would
 * otherwise hand back the exact same records every time. To fix that without
 * losing the want-sorted quality signal, we fetch a wider pool per combo and
 * weighted-sample down to `perCombo`, favoring (not requiring) higher want
 * counts. Same Discogs call count and per_page cost tradeoff — no extra
 * rate-limit budget spent, and this holds even if Discogs' response for that
 * URL is itself cached, since the sampling happens after the fetch. */
export async function browseByGenreDecade(
  genres: string[],
  decades: string[],
  limit = 20,
): Promise<Recommendation[]> {
  const genreSeeds = (genres.length > 0 ? genres : ["Rock"]).slice(0, 4);
  const decadeSeeds = decades.length > 0 ? decades.slice(0, 3) : [""];

  const combos: { genre: string; decade: string }[] = [];
  for (const genre of genreSeeds) {
    for (const decade of decadeSeeds) combos.push({ genre, decade });
  }
  // Bound the number of Discogs searches; each genre is represented at least
  // once by ordering genre-major above.
  const capped = combos.slice(0, 6);
  const perCombo = Math.max(8, Math.ceil((limit * 1.5) / capped.length));
  const poolSize = Math.min(BROWSE_POOL_MAX, perCombo * BROWSE_POOL_MULTIPLIER);

  const lists = await Promise.all(
    capped.map(async ({ genre, decade }) => {
      const decadeYear = decade ? decade.replace("s", "") : "";
      const q = encodeURIComponent(`${genre} ${decadeYear}`.trim());
      const reason = decade
        ? `Matches your ${genre} and ${decade} preferences`
        : `Matches your ${genre} preference`;
      try {
        const data = await discogsFetch<{ results: DiscogsSearchResult[] }>(
          `/database/search?q=${q}&type=release&format=Vinyl&per_page=${poolSize}&sort=want`,
        );
        const pool = (data.results ?? []).map((r) =>
          searchResultToRecommendation(r, reason),
        );
        return weightedSample(
          pool,
          perCombo,
          (rec) => (rec.wantCount ?? 0) + 1,
        );
      } catch {
        return [] as Recommendation[];
      }
    }),
  );

  const seen = new Set<number>();
  const merged: Recommendation[] = [];
  for (const rec of interleave(lists)) {
    if (seen.has(rec.discogsReleaseId)) continue;
    seen.add(rec.discogsReleaseId);
    merged.push(rec);
  }

  return merged.slice(0, limit);
}

/** "More like this" for an album page: other popular vinyl sharing the release's
 * most specific style (falling back to genre), excluding the album itself. One
 * cheap Discogs search — safe to call inline on the album page. Collects a
 * little past `limit` so the caller has headroom to dedupe cross-pressings
 * (different release ids, same album) without falling short of the target. */
export async function getSimilarReleases(
  release: Pick<DiscogsRelease, "id" | "genres" | "styles">,
  limit = 12,
): Promise<Recommendation[]> {
  const seed = release.styles[0] ?? release.genres[0];
  if (!seed) return [];

  const collectionCap = limit + 4;
  const q = encodeURIComponent(seed);
  const data = await discogsFetch<{ results: DiscogsSearchResult[] }>(
    `/database/search?q=${q}&type=release&format=Vinyl&per_page=${collectionCap + 8}&sort=want`,
  );

  const seen = new Set<number>([release.id]);
  const results: Recommendation[] = [];
  for (const r of data.results ?? []) {
    if (seen.has(r.id) || !r.cover_image) continue;
    seen.add(r.id);
    const parsed = splitDiscogsTitle(r.title);
    results.push({
      discogsReleaseId: r.id,
      title: parsed.title || r.title,
      artist: parsed.artist,
      year: r.year ? parseInt(r.year, 10) : null,
      coverUrl: r.cover_image ?? null,
      genres: [...(r.genre ?? []), ...(r.style ?? [])],
      formats: r.format ?? [],
      communityRating: null,
      ratingCount: null,
      wantCount: r.community?.want ?? null,
      haveCount: r.community?.have ?? null,
      spotifyAlbumId: null,
      spotifyUrl: null,
      score: 0,
      reasons: [`More ${seed} on vinyl`],
    });
    if (results.length >= collectionCap) break;
  }
  return results;
}

export interface PressingVersion {
  id: number;
  title: string;
  country: string | null;
  released: string | null;
  format: string | null;
  inWantlist: number | null;
  inCollection: number | null;
}

/** Every pressing/reissue/regional variant of an album, for a "compare
 * pressings" view. One Discogs call regardless of how many versions exist —
 * deliberately does NOT fetch marketplace price per version (that would be
 * one more rate-limited call per row, and a popular album can have dozens of
 * versions). Want/have stats come back inline on this endpoint, so those are
 * "free." */
export async function getMasterVersions(
  masterId: number,
  limit = 20,
): Promise<PressingVersion[]> {
  try {
    const data = await discogsFetch<{
      versions?: {
        id: number;
        title: string;
        country?: string;
        released?: string;
        format?: string;
        stats?: { community?: { in_wantlist?: number; in_collection?: number } };
      }[];
    }>(`/masters/${masterId}/versions?per_page=${limit}`);

    const versions = (data.versions ?? []).slice(0, limit).map((v) => ({
      id: v.id,
      title: v.title,
      country: v.country ?? null,
      released: v.released ?? null,
      format: v.format ?? null,
      inWantlist: v.stats?.community?.in_wantlist ?? null,
      inCollection: v.stats?.community?.in_collection ?? null,
    }));

    // The endpoint doesn't support sorting by demand, so do it client-side —
    // most-wanted pressings first is the useful order for "which pressing
    // should I chase."
    return versions.sort((a, b) => (b.inWantlist ?? 0) - (a.inWantlist ?? 0));
  } catch {
    return [];
  }
}
