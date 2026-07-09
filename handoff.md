# Record Finder — Handoff

Last updated: 2026-07-08

## What this is

**Record Finder** is a Next.js vinyl discovery app. Anyone can search the full Discogs vinyl catalog with no account (`/search`), or take a taste quiz (no account required) to get Discogs-backed album recommendations scored to their listening history and preferences, optionally sharpened by connecting Spotify. Album pages show pressing details (including matrix/runout and mastering credits), a cross-pressing comparison, marketplace pricing, a fair-value signal (now backed by real price history for wishlisted releases — see "Price history & deals"), wishlist with price-drop email alerts, feedback, and a credits-based reservation flow for concierge queue spots with a lightweight scarcity indicator.

**North star:** be the best vinyl-searching site and get people the best deals on vinyl. **North star for recommendations:** picks that feel like a friend who knows your taste — not generic genre browsing. **North star for differentiation:** build things on the Spotify-listening ↔ Discogs-vinyl bridge that a plain marketplace (Discogs) or a blind curated subscription (VMP-style) structurally can't offer — see "Vinyl-native differentiation features" below.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19 |
| UI / motion | Tailwind CSS v4, hand-rolled primitives (no UI lib); `gsap` + `framer-motion` for motion; **no 3D libs** (a WebGL scene was removed — see below) |
| Auth | NextAuth v5 — Spotify OAuth only |
| DB | SQLite via Drizzle + libSQL / `@libsql/client` (`file:./data/record_finder.db` locally; Turso optional in prod) |
| APIs | Discogs (vinyl source of truth), Spotify, Last.fm, MusicBrainz, Apple Music (iTunes Search) |
| Email | Resend (price-drop alerts only; no other transactional email yet) |
| Scheduled jobs | Vercel Cron (`vercel.json`) — first cron job in this repo, see "Price history & deals" |
| Tests | Vitest |

## User flows

```
Home → Taste Quiz (7 steps) → Discover → Album detail
         ↓ optional
    Spotify connect → full listening sync → sharper picks

Search (guest, no quiz) → Album detail
```

1. **Search** (`/search`) — full-catalog Discogs vinyl search, no quiz or sign-in required. See "Catalog search" below.
2. **Quiz** (`/quiz`) — genres, sub-genres, decades, moods, album A-vs-B battles, listening style, deep-cut slider. Guests get a signed cookie ID; data persists without sign-in.
3. **Spotify connect** — OAuth scopes: `user-top-read`, `user-read-recently-played`, `user-library-read`. Sync runs on home page connect and before recommendation generation when snapshot is stale (24h).
4. **Discover** (`/discover`) — requires completed quiz. Reads recommendation cache on SSR; client triggers `POST /api/recommendations` if empty (~25s Discogs pass). A local-filter miss ("no matches in your picks") links out to `/search?q=...` for the full catalog.
5. **Album** (`/album/[id]`) — Discogs release detail, feedback (like/dislike/own/hide), wishlist (signed-in), reserve with credits, Spotify link. Reachable from Discover, Search, or Wishlist; the back link (`album/back-link.tsx`) goes to whichever one you came from via browser history, falling back to Discover on a direct link.
6. **Wishlist** (`/wishlist`) — requires Spotify sign-in.

On Spotify sign-in, `mergeGuestData()` moves guest quiz, wishlist, feedback, quiz responses, and Spotify snapshot (if account has none) to the real user ID.

## Taste Intelligence (recent work)

Implemented per the Taste Intelligence Roadmap. This is the app's differentiation layer.

### Data farming (Phase 1)

**Spotify client** (`src/lib/spotify/client.ts`) fetches:

- Top artists & tracks across `short_term`, `medium_term`, `long_term`
- Recently played (50 tracks)
- Saved albums & saved tracks (paginated, up to ~100 each)
- Assembled via `fetchFullListeningSnapshot()`

**Sync** (`src/lib/spotify/sync.ts`):

- `syncSpotifyListening(userId, accessToken)` — fetches all signals, derives taste vector, persists, clears recommendation cache
- Exposed at `GET/POST /api/spotify/top` (POST = force refresh)
- UI: `src/components/spotify-sync.tsx` shows sync stats on home

**Taste vector** (`src/lib/taste/derive-profile.ts`):

Pure computation from raw Spotify + quiz album battle preferences:

```typescript
interface TasteVector {
  artistWeights: Record<string, number>;  // 0–1
  albumWeights: Record<string, number>;
  genreWeights: Record<string, number>;
  coreArtistIds: string[];      // long/medium identity artists
  trendingArtistIds: string[];  // short-term only
  derivedAt: string;
}
```

Stored in `spotify_snapshot.taste_vector` (JSON).

### Algorithm (Phase 2, hardened in the recommendation-engine overhaul)

**Pipeline** (`src/lib/recommendations/load.ts`):

1. Gate on completed quiz
2. Return cache if fresh (1h TTL) unless refresh requested
3. If Spotify connected + stale snapshot → full sync
4. **Spotify path:** seed candidates from saved-album artists, trending artists, core artists, Last.fm similar artists, taste-vector genres → score via `scoreCandidates()`.
   **Quiz-only fallback path:** fan out across the user's top genres × decades (not just `genre[0] + decade[0]`), weighted-sampling a wide per-combo pool by want-count (`weightedSample`, `src/lib/utils/weighted-sample.ts`) so "Refresh picks" actually varies instead of returning Discogs' deterministic top-N every time → score via `getQuizOnlyRecommendations()`
5. Exclude own/hide feedback
6. **Dedupe** cross-pressing duplicates (`dedupeRecommendations`, matches on normalized artist+title) and **diversify** across genres (`diversifyByGenre`, round-robins genre buckets) — `src/lib/recommendations/dedupe.ts`
7. **Enrich** with Discogs rating/price/want/have via one combined `/releases/{id}` call per pick (`enrichRecommendations` → `getReleaseEnrichment`) — previously ratings were left `null`, silently breaking the highest-rated sort, the min-rating filter, and the ⭐ badge
8. **Finalize**: re-score into a normalized 0–100 blend of relevance/rating/desirability (`finalizeScores`, `src/lib/recommendations/finalize.ts`) — replaces the old unbounded raw sum
9. Flag batch-relative **fair-value** picks (`computeFairValue`, `src/lib/recommendations/fair-value.ts`)
10. Cache

**Scoring highlights** (`src/lib/recommendations/engine.ts`) — these are the *raw* per-candidate inputs to `scoreCandidates()`/`getQuizOnlyRecommendations()`, before the finalize blend in step 8 normalizes them:

| Signal | Effect |
|--------|--------|
| Artist affinity (taste vector) | up to +30 (graduated, not binary) |
| Album affinity | up to +25 |
| Saved album exact match | +20 |
| Same artist as saved album | +10 |
| Recent rotation (7-day decay) | up to +12 |
| Last.fm similar artist | scaled by match % (up to ~12) |
| Wishlist artist | +15 |
| Quiz album battle winner | +18 |
| Quiz sub-genre overlap | +8 per match |
| Feedback like/dislike | +15 / −25 per artist |
| Mood/format/deep-cut fit | `quizAffinityAdjustment()` — shared by **both** paths |
| Feedback like/dislike/wishlist | `feedbackAffinityAdjustment()` — shared by **both** paths |

The last two used to be Spotify-path-only; quiz-only recommendations only used them for reason text, never for ranking. Both are now extracted into shared, independently-tested functions in `engine.ts` so quiz-only users' quiz answers and feedback clicks actually move the needle.

**Finalize / score normalization** (`src/lib/recommendations/finalize.ts`) — `finalizeScores(recs, deepCutLevel, weights)` blends three batch-relative components into a 0–100 score:
- **Relevance** (default weight 0.6): the raw per-candidate score above, min-max normalized within the batch
- **Rating** (0.3): Bayesian-shrunk community rating (`ratingScore` — prior 3.8, confidence 50 votes, so a 4.9 from 5 voters doesn't outrank a 4.6 from thousands)
- **Desirability** (0.1): log-scaled want-count, **direction flips on `deepCutLevel`** — mainstream-leaning users get a popularity-favoring signal, deep-cut lovers get an obscurity-favoring one, neutral at 50. (Before this, desirability always rewarded popularity, actively fighting a deep-cut lover's own stated preference.)

**Fair value** (`src/lib/recommendations/fair-value.ts`) — `computeFairValue()` flags picks in the top quartile of want/have ratio *and* bottom quartile of price, both computed relative to the current batch. Deliberately not a true historical "underpriced vs. the real market" claim — Discogs doesn't expose sold-price history, so there's no data for that without a new price-history table + a periodic snapshot job (no cron infra exists in this repo yet — see Deferred).

**Explainability** — `buildReasons()` cites saved albums, recent rotation, core-artist deep cuts, library similarity, quiz genre/mood matches.

**Fallback** — no Spotify or API failure → `getQuizOnlyRecommendations()` (Discogs browse by genre/decade, now genre/decade-diverse and feedback-aware — see pipeline step 4 above).

### Intensive quiz (Phase 3)

7-step flow in `src/components/quiz/quiz-flow.tsx`:

1. Genres (max 6)
2. Sub-genre drill-down per genre (`src/lib/quiz/sub-genres.ts`, max 3 each)
3. Decades (max 4)
4. Moods (max 4)
5. Album A-vs-B battles (`src/lib/quiz/album-battles.ts`, 3 curated pairs by genre)
6. Listening style (singles / balanced / full albums)
7. Deep-cut slider

Quiz responses stored separately in `quiz_responses` (album preferences + sub-genres). Summary stays in `taste_profile`. Completing quiz re-derives taste vector if Spotify snapshot exists.

## UI, theming & ambient scene

**Themes** (`src/lib/themes.ts`) — six full themes, each defining `--color-*` custom properties and a display font: `record-store-noir` (default), `midnight-wax`, `analog-warmth`, `neon-crate`, `hifi-minimal`, `jazz-club`. Selection persists in `localStorage` (`record-finder-theme`) via `ThemeProvider` (`src/components/theme-provider.tsx`), which reads through `useSyncExternalStore` (SSR-safe, no setState-in-effect) and sets `data-theme` on `<html>`. Picker UI: `theme-picker.tsx`; per-theme font swap: `theme-font-sync.tsx`.

**Ambient scene** — the four dark "cinematic" themes (`IMMERSIVE_THEMES` / `isImmersiveTheme()`: record-store-noir, midnight-wax, neon-crate, jazz-club) render a slow-spinning **CSS vinyl record** in the hero plus glow orbs, a raking light beam, vignette, and floor glow. Light/minimal themes (analog-warmth, hifi-minimal) stay clean. All scene colors derive from theme accent/surface tokens via `color-mix`, so it recolors per theme automatically. Components: `noir/noir-atmosphere.tsx`, `home/noir-hero.tsx`; styles in `src/app/globals.css`. Everything honors `prefers-reduced-motion` (`src/hooks/use-reduced-motion.ts`).

> **Note:** an earlier heavier WebGL/three.js scene rendered near-invisible and was replaced by the CSS scene above. `three` / `@react-three/*` have been removed — do not reintroduce them.

**Layout** — `app-shell.tsx` wraps pages with the atmosphere, desktop `app-nav.tsx`, and a mobile bottom-tab `mobile-nav.tsx` (auto-hides on `/album/*`, which uses a sticky action bar instead). Page/stagger transitions: `src/components/motion/`.

**Discover / album UI** — poster cards (`discover/poster-card.tsx`) with dark-glass price + rating + fair-value badges (stacked top-left) and a vinyl "no cover art" placeholder; carousels via Embla (`discover/carousel-row.tsx`); grid (`discover/discover-grid.tsx`). Filters (`discover/discover-filters.tsx`) cover search, genre, decade, sort (incl. price-low), min rating, deep-cut-only, for-sale-only, max price, format, and good-value-only. The discover feed (`discover/discover-feed.tsx`) shows an "auto-refreshes in Xm" hint next to the refresh button, driven by a `useNowMinute()` hook (`src/hooks/use-now-minute.ts`, `useSyncExternalStore`-based to avoid a hydration mismatch on "current time").

The album page's presentation is extracted into `components/album/album-detail.tsx` (the route just fetches data); buy/reserve/wishlist actions in `album/album-actions.tsx` (a single button row with concierge helper text below). "More like this" (`album/similar-releases.tsx`), pressing comparison (`album/compare-pressings.tsx`), and — on the home page — listening-intent nudges (`home/listening-intent-row.tsx`) are each async Server Components streamed in behind a `<Suspense>` boundary, since they do slower per-item Discogs enrichment/validation that shouldn't block the rest of the page.

## Vinyl-native differentiation features

Four features built entirely on data/infra already in place (no new schema, no new cron):

- **Pressing details** (`album/pressing-details.tsx`) — matrix/runout codes, mastering credits (e.g. "Mastered By"), pressing-plant/label credits, and freeform pressing notes. All of this was already in the `/releases/{id}` response `getRelease()` fetches; it just wasn't parsed. `DiscogsRelease` (`src/lib/types.ts`) now carries `identifiers`, `companies`, `extraArtists`, `notes`, `masterId`.
- **Compare pressings** (`album/compare-pressings.tsx`) — every pressing/reissue/regional variant of an album via `getMasterVersions()` (`src/lib/discogs/client.ts`), one Discogs call regardless of how many versions exist, sorted by want-count. Deliberately does **not** fetch marketplace price per version (would be N extra rate-limited calls for an album with dozens of pressings).
- **Fair-value badge** — see "Finalize / score normalization" above. Surfaced as a poster-card badge, an album-page callout, and a "Good value only" discover filter.
- **Reservation scarcity** — `getReservationCountForRelease()` (`src/lib/db/queries.ts`) counts existing `orders` rows for a release; shown as a "N collectors already reserved a spot" badge in the reserve-confirmation modal (`album/reserve-with-credits-button.tsx`). No cap — it never blocks a reservation, and the copy is deliberately careful not to imply a real inventory lock (there's no purchase-completion tracking; the buyer still completes the purchase on Discogs themselves).
- **Listening-intent nudges** (`src/lib/recommendations/listening-intent.ts`, `home/listening-intent-row.tsx`) — surfaces albums the user has replayed 3+ times in the last 7 days, or that clear a taste-vector `albumWeights` threshold (≥0.7, reusing the existing `artistWeights` cutoff), that aren't already wishlisted or in the current recommendation batch. Each candidate is validated against a real Discogs vinyl pressing via `searchVinylRelease()` before surfacing. Home-page only, gated on Spotify connection, computed independently of the hourly recommendation cache (this signal is inherently time-sensitive).

## Catalog search (2026-07-08)

Full-catalog Discogs vinyl search, guest-accessible (no quiz, no sign-in) — first-class entry point per the "best vinyl searching site" north star, distinct from Discover's filter box (which only searches within a signed-in user's ~20-25 personalized recommendations). There was previously a dead, unused API route at this path that this replaced; nothing in the UI called it before.

- **`searchCatalog(query, page)`** (`src/lib/discogs/client.ts`) — hits `/database/search` with relevance-default sort (not `sort=want`, so a literal title/artist search surfaces the actual match first), page size fixed small (10) since every result costs one more Discogs call to enrich under the shared 1-req/sec throttle. Returns results in the existing `Recommendation` shape (via a private `searchResultToSearchHit`, parallel to but distinct from `searchResultToRecommendation` — a search hit has no personalized "reason") plus a `SearchPagination` envelope (`src/lib/types.ts`).
- **`GET /api/discogs/search`** — rewritten (previously raw Discogs JSON passthrough); validates and clamps the query, enriches the page with `enrichRecommendations()` (price/rating), and flags fair value on that page-batch — batch-relative by default, upgraded to real historical fair value wherever price history exists (see "Price history & deals" below). `maxDuration = 30`, matching `/api/recommendations`'s precedent for a rate-limited Discogs pass.
- **`/search` page + `SearchFeed`** (`src/components/search/search-feed.tsx`) — input, `VinylLoader` (~10-12s for a full page with price/rating — a conscious latency-for-richness tradeoff, not an oversight), `DiscoverGrid` reused as-is for results, prev/next pagination. No filters, no genre grouping, no view-mode toggle — deliberately thinner than Discover.
- **Nav** — added to both `app-nav.tsx` (desktop) and `mobile-nav.tsx` (now 5 tabs) as a permanent, always-visible entry point, and to Discover's empty-filter-result state as a "Search all vinyl for '...'" bridge link.
- **Known gap, accepted for v1:** no rate limiting or abuse protection exists for this now-public route beyond the shared Discogs throttle (which protects the app's Discogs quota, not against one client monopolizing it). Quiz-gating was incidentally serving as informal abuse protection before this. If abuse becomes a real problem, add a per-IP/session soft limit (no Redis/KV in this repo today — would need an in-memory or DB-backed sliding window).

## Price history & deals (2026-07-08)

Real (non-batch-relative) fair value and wishlist price-drop email alerts — the flagship "best deals" feature per the north star, and this repo's first scheduled job. Previously blocked on two things (see the old "Deferred" entry): no price-history data, and no cron infrastructure. Both now exist, scoped deliberately narrow for v1.

**Tracking scope — wishlist items only**, deduped across users. Not every release ever shown in Discover/Search — that would be unbounded and mostly wasted (most shown records are never revisited). This means: real fair value only kicks in for releases someone has already wishlisted; everything else still gets the original batch-relative badge. This compounds over time as more records get wishlisted and accumulate history — it's an honest tradeoff, not a regression.

- **Schema** (`drizzle/schema.ts`, migration `0005_peaceful_scarecrow.sql`) — new `price_history` table (`discogsReleaseId`, `lowestPrice`, `currency`, `numForSale`, `snapshotAt`, indexed on `(discogsReleaseId, snapshotAt)`); `wishlist_items` gains `priceAtAdd` (captured once, at add-time) and `lastAlertedPrice` (the price we last emailed about — only a *further* drop below it re-alerts, so a price that stays low isn't nagged about daily).
- **`GET /api/cron/snapshot-prices`** (new) — the daily job. Auth via Vercel's real cron convention (`Authorization: Bearer $CRON_SECRET`, checked in the route — **not** a custom header). `getReleaseIdsNeedingSnapshot()` (`src/lib/db/queries.ts`) picks up to 100 releases per run, never-snapshotted and stalest-first, so the per-invocation Discogs call count stays bounded regardless of how large the wishlist set grows (round-robins through a backlog over multiple days if it exceeds the cap). Then computes price-drop alerts and emails once per affected user (not once per item). `maxDuration = 120`.
- **`vercel.json`** (new, repo had none) — `{ "crons": [{ "path": "/api/cron/snapshot-prices", "schedule": "0 10 * * *" }] }`. The schedule only actually fires once deployed to Vercel with `CRON_SECRET` set in the project's env vars — this is still a local-dev-only project (no `.vercel/`), so this ships the mechanism; activation is a deploy-time step.
- **Real fair value** — `applyHistoricalFairValue()` (`src/lib/recommendations/fair-value.ts`) overrides the existing batch-relative `computeFairValue()` flag wherever a release has ≥3 price-history snapshots: good value if the current price is ≥15% below *that release's own* historical median, not "cheap relative to today's other 20 picks." Wired into both `load.ts` (Discover) and `/api/discogs/search`, via a batched, zero-Discogs-call DB read (`getPriceHistoryStatsForReleases()`) — the upgrade is free at read time; all the Discogs cost is in the daily snapshot job.
- **Price-drop alerts** — `findPriceDropAlerts()` / `groupAlertsByUser()` (`src/lib/commerce/price-alerts.ts`, pure and unit-tested) apply a 10% drop threshold (`PRICE_DROP_THRESHOLD`) against `lastAlertedPrice ?? priceAtAdd`. Email content is a pure, tested template (`src/lib/email/price-drop-alert.ts`); the actual Resend call is a thin, untested I/O wrapper (`src/lib/email/send.ts`) that logs and skips (doesn't throw) if `RESEND_API_KEY` is unset — a missing email key never stops price snapshotting. The wishlist page shows the same signal as a "↓ Down from $X" badge (`WishlistCard`, `wishlist-button.tsx`), computed server-side from data already in the DB — no extra Discogs call to render it.
- **Important caveat:** like any transactional email provider, Resend requires a verified sending domain to email real users — without one, only the developer's own Resend-verified test address can receive mail. This is a one-time setup outside this repo, not a code gap.
- **`addToWishlist`'s API route** (`POST /api/wishlist`) now also calls `getMarketplaceStats()` once and sets `priceAtAdd` — bootstraps a baseline immediately rather than waiting for the next cron cycle.

## Multi-source "Where to buy" offers (2026-07-08)

The first step toward the "cheapest price across every source" north star — an
album-page panel that aggregates buy options beyond Discogs and ranks them
cheapest-first. Preceded by a research spike (see git history: coverage +
live-match spikes) that de-risked the approach before this build.

- **Normalized offer layer** (`src/lib/offers/`) — every source maps into one
  `Offer` shape (`types.ts`); adapters are pluggable so eBay / Shopify / local
  shops slot in later without touching the UI.
  - `match.ts` — cross-source identity: UPC→GTIN-13 normalization + barcode
    extraction from a release's `identifiers`, fuzzy artist+title coverage
    scoring, wrong-format (CD/cassette) and non-record (merch/replica/book)
    penalties, and `verified/likely/possible/rejected` tiers. Pure, unit-tested.
  - `discogs.ts` — Discogs marketplace adapter. Yields a single **verified**
    offer from `release.marketplace` (already fetched by `getRelease`, so zero
    extra Discogs calls). Discogs' API only exposes aggregate lowest-price, not
    per-seller rows, so this is "cheapest on Discogs", not a seller list.
  - `google-shopping.ts` — SerpApi Google Shopping meta-search: one integration
    federates Amazon/eBay/Walmart/B&N/countless shops. Query is **text-first**
    (`"artist title vinyl LP"`) — the spike proved querying by raw UPC returns
    unrelated junk on Google Shopping (it keyword-matches the digits). Gated on
    `SERPAPI_KEY`; absent key = panel just shows the Discogs offer.
  - `orchestrator.ts` — `getOffers(release)`: runs adapters in parallel with
    per-source failure isolation, filters to likely+ (≥0.75), de-dupes, ranks by
    **landed cost (price + shipping)**, caps at 8. TTL cache (6h) keeps the paid
    meta-search cost bounded — DB-backed (`offer_cache`, mirroring
    `recommendation_cache`) since the "DB-backed offer cache" entry below.
- **UI** — `components/album/where-to-buy.tsx`, an async Server Component
  streamed behind `<Suspense>` in `album-detail.tsx` (same pattern as
  `SimilarReleases`), since the meta-search is slow/networked/paid. Rows show
  seller, a per-source tag (Google Shopping / eBay / Discogs / local shops),
  price + shipping note, a confidence badge (green **Verified** = this exact
  release; **Likely** = matched by artist+title), and a "Best price" highlight
  on the cheapest. Outbound links carry `rel="... sponsored"`.
- **Verified live** on real records across desktop / light theme / mobile: e.g.
  Blue Lines returns 8 ranked offers ($14.99 Vinyl Junkies … $36.07 verified
  Discogs), including Barnes & Noble surfaced *via Google Shopping*.
- **Known limits (v1):** offers cap at "likely" from Google Shopping (list items
  don't expose a UPC to verify against); unknown shipping is treated as $0 for
  ranking (shown as "plus shipping"); the non-record penalty is a starter
  heuristic.

## eBay + affiliate tagging + local-shop (Shopify) sources (2026-07-08, later)

Second and third steps of the offer roadmap: a second/third source, plus turning the outbound links into real (or ready-to-be-real) revenue.

- **`src/lib/offers/ebay.ts`** — eBay Browse API adapter. GTIN search first
  (`?gtin=...`) — eBay's own catalog does the barcode match here, not our fuzzy
  scorer, so a hit is a genuine **verified** offer, unlike Google Shopping's
  ceiling of "likely". Falls back to the same text query + fuzzy scoring when
  the release has no UPC. OAuth2 client-credentials with an in-process cached
  app token (~2h). Gated on `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`; the
  orchestrator skips it silently without them. **Code-complete and unit-tested
  but not live-verified** — no eBay Developer credentials were available this
  session.
- **`src/lib/offers/affiliate.ts`** — outbound link tagging, applied last (after
  ranking/dedup, so those operate on authentic URLs) and cached alongside the
  offer list:
  - **eBay** — sends `EBAY_CAMPAIGN_ID` via the `X-EBAY-C-ENDUSERCTX` header on
    the search request (format verified against eBay's docs), so the Browse
    API itself returns an affiliate-tagged `itemAffiliateWebUrl` — no separate
    link-rewriting needed.
  - **Everything else** (arbitrary retailers surfaced via Google Shopping —
    Walmart, Barnes & Noble, indie shops we have no individual deal with) is
    wrapped through **Skimlinks**' `go.skimresources.com` redirect, which
    auto-affiliates ~48,500 merchants through one integration, no per-merchant
    signup. Gated on `SKIMLINKS_PUBLISHER_ID`.
  - `hasAffiliateLink()` is a ground-truth check on the *actual rendered URLs*
    (not "is config present"), so the panel's FTC disclosure footer only shows
    when a link is genuinely tagged — verified live end-to-end with a
    placeholder Skimlinks ID (7/8 real offers wrapped correctly, Discogs link
    left untouched, disclosure appeared), then reverted to the inactive,
    commented-out `.env.local` state.
  - Discogs has no wired affiliate program yet — its offer is always a direct
    link.
- **`src/lib/offers/shopify.ts`** — the seed of the local-record-store
  flywheel. Every Shopify storefront exposes its full catalog at a public,
  no-auth `/products.json` (used by Shopify's own theme JS) — zero API keys,
  zero per-shop integration work. **Verified live against a real store**
  (turntablelab.com, not registered as a partner — used only to prove the
  fetch/match mechanics on real, messy data): true match ("Catherine Wheel —
  Chrome") scored 0.95/likely with the correct price and product URL; a
  different album by the same artist correctly scored below the display
  threshold; unrelated real inventory never false-matched. Confirmed the
  public feed has **no `barcode` field** (that's Admin-API-only) by inspecting
  a live response — so Shopify offers, like Google Shopping's, can only ever
  reach "likely", never "verified".
  - **`local_shops` table** (migration `0006_perpetual_ted_forrester.sql`) is
    the shop registry — `name`, `domain`, `city`, `region`, `active`. Queries:
    `listActiveLocalShops()`, `addLocalShop()` (idempotent on `domain`) in
    `db/queries.ts`.
  - **This is foundation only, not a public feature yet** — there is no
    self-serve "claim your shop" form, no ownership verification, no
    moderation queue. Shops are registered by hand by calling `addLocalShop()`
    (e.g. from a one-off script or a future admin route). The `local_shops`
    table is currently **empty** in this repo — nothing changes for end users
    until shops are actually registered.
  - **No per-shop catalog cache/index yet** — each offer request live-fetches
    a shop's first 250 products. Fine for a handful of shops; once there are
    more than a few, a periodic sync job (mirroring the price-snapshot cron)
    should replace the live fetch.
- **`orchestrator.ts`** — networked sources (Google Shopping, eBay, Shopify)
  now run in parallel via a shared `fetchSource()` isolator instead of
  sequentially; each source's failure/absence is reported independently and
  never blanks the panel. Fixed a footer-label bug where any non-Google-Shopping
  source was mislabeled "Discogs" (would have mislabeled eBay before it shipped).

## DB-backed offer cache (2026-07-08, later)

Replaced the offer panel's in-process `Map` cache (lost on every serverless cold start, not shared across instances — the "prod step" flagged in the original build) with a real DB-backed cache, same pattern as `recommendation_cache`.

- **`offer_cache` table** (migration `0007_thick_lake.sql`) — one row per `discogsReleaseId`, `offers`/`sources` as JSON, `expiresAt`/`createdAt`. Queries: `getCachedOffers()`, `cacheOffers()` in `db/queries.ts`. Deliberately untyped (`unknown`) on the DB side — `offers/orchestrator.ts` owns the real `Offer[]`/`SourceStatus[]` shapes and casts on read, so `db/queries.ts` doesn't need to import from `lib/offers`.
- **A real bug caught by its own test**: SQLite's `{ mode: "timestamp" }` integer columns truncate to whole seconds on write, but the in-memory `OfferResult.fetchedAt` used millisecond `Date.now()` — so a fresh response and an immediately-following cached read of the *same write* wouldn't have matched bit-for-bit. Fixed by rounding once (`Math.floor(Date.now() / 1000) * 1000`) and threading that single `Date` through both the returned result and the persisted row, rather than two independently-generated timestamps.
- **Verified end-to-end, unconfounded**: cleared the cache table, ran `getOffers()` twice in a row on a release untouched anywhere else this session — 115ms (cold) → 1ms (cached), exact `fetchedAt` and content equality. (Also verified, in passing, that raw SerpApi latency is genuinely ~150-200ms per query — the "16s" page-load times seen earlier in this session are the *unrelated*, pre-existing Discogs 1-req/sec throttle used by `SimilarReleases`/`ComparePressings`, not this panel; don't mistake total album-page load time for this cache's own performance.)
- **`getOffers(release, { fresh: true })`** bypasses the cache and overwrites the row — proven with a content-based test (cache a `numForSale: 5` result, then `fresh: true` with `numForSale: 9` for the same release id, assert the new value both in the return value and in the persisted row) rather than a timing-based one, since two real `Date.now()` calls can legitimately land in the same rounded second.

## UI/UX craft pass (2026-07-08, later)

A visual/motion-only polish pass — no behavior, data-flow, or business-logic changes. Highlights:

- **Shared full-bleed layout** (`src/lib/layout.ts`) — the "break out of AppShell's max-w-6xl, re-center with a calc() gutter" trick previously duplicated across 7 files is now four constants (`FULL_BLEED`, `BLEED_PX/MX/PL/PR`) used everywhere. Fixed Discover's double mobile padding (`px-4 sm:px-0` inside an already-padded shell).
- **New CSS utilities** (`globals.css`): `focus-ring` (on-brand accent focus-visible outline, applied to every hand-rolled interactive element — pills, tabs, icon buttons, card links) and `pressable` (150ms color/transform transition + `scale(0.97)` on `:active`, with `prefers-reduced-motion` opt-out baked in). `Button` now uses both.
- **Motion**: toasts and the modal animate in/out via `AnimatePresence` (were hard pops); `DiscoverGrid` reveals with a new `staggerGrid` variant (0.04s/child — shared by Discover grid view and Search results, re-keyed per query/page); quiz steps get a real keyed fade-up (the old `animate-in fade-in` classes came from a Tailwind plugin that was never installed, i.e. dead); the wishlist price-drop badge pops in on a delayed spring (`PriceDropBadge`); wishlist rows stagger; Suspense-streamed server content (listening-intent row, "more like this", compare pressings) eases in via a pure-CSS `stream-fade-in`; section/inline `VinylLoader`s fade in (`vinyl-loader-enter`). All of it respects `prefers-reduced-motion` (framer paths via `useReducedMotion`, CSS paths via the shared media block).
- **Shared `EmptyState`** (`src/components/ui/empty-state.tsx`) — Discover's empty shelf, Search's intro/no-results, and the wishlist empty state now share one visual language (ghosted icon + shelf line + display title + action).
- **Mobile nav** — 5 tabs now `flex-1` (the old `min-w-[4rem]`×5 + padding overflowed a 320px viewport), with an animated `layoutId` active indicator matching the desktop nav (static bar under reduced motion).
- **Carousel** — arrow buttons and their 44px reserved gutter are hidden below `sm` (touch swipes the row directly; the gutter made mobile rows look inset ~60px).
- **Showcase auto-scroll** — the home "Top picks for you" row now drifts slowly and continuously (opt-in `autoScroll` prop on `CarouselRow`), pausing on hover / keyboard-focus / touch and looping seamlessly. Deliberately scoped to that **one** showcase row — the Discover browse rows stay manual (many rows drifting at once is motion soup and fights browsing). Fully disabled under `prefers-reduced-motion` (both the `loop` option and the plugin are gated on `!reducedMotion`). Uses `embla-carousel-auto-scroll` (`^8.6.0`, first-party Embla plugin matching the installed core; not a new motion library). While adding this, the row's drag-vs-click detection was rewritten to measure real pointer pixel-travel on the DOM instead of listening to Embla's `scroll` event — the old heuristic flagged every tap on a drifting row as a drag and swallowed the click; the new one is autoplay-agnostic and strictly more correct for the manual rows too.
- **Album route `loading.tsx`** — the slowest route in the app (rate-limited Discogs fetch) previously showed a blank page for seconds on navigation; now shows the contextual `VinylLoader` like Discover.
- **Fixed a real hifi-minimal bug**: `poster-title-below` rendered *on top of* the cover (normal-flow child inside the absolute-stacked aspect box) instead of below it — moved outside the aspect container.
- Verified in-browser across viewports (320/375/desktop) and themes (noir, analog-warmth, hifi-minimal, neon-crate, jazz-club); tests/typecheck/lint green throughout (177 tests). Signed-in-only surfaces (wishlist list with price-drop badge, reserve modal) were verified by code-path parity only — Spotify OAuth isn't available in the preview.

## Polish & hardening pass (2026-07-08)

Full manual walkthrough of every user flow (quiz retake, discover rows/grid/filters/search, album detail, feedback, guest gating on wishlist/reservation, theming, mobile) plus targeted new test coverage. Found and fixed three real bugs, none of which were caught by the existing test suite because the affected code paths had no tests:

- **Album pages showed "Unknown" as the artist** for any release whose Discogs `title` field didn't happen to be formatted `"Artist - Title"` (most don't — that convention only reliably holds for `/database/search` results, not `/releases/{id}`). `getRelease()` (`src/lib/discogs/client.ts`) now reads the artist from the response's own `artists` array instead of splitting the title, honoring each artist's `join` separator and stripping Discogs' `(2)`-style disambiguation suffix.
- **Duplicate discover rows for the same genre** (e.g. both "Hip-Hop" and "Hip Hop") — quiz genre labels use hyphens, raw Discogs genre strings use spaces, and the row-building dedup in `groupRecommendations()` (`src/lib/recommendations/group.ts`) compared them as exact strings. Now normalized through the existing `normalize()` helper (`src/lib/recommendations/match.ts`) before comparing.
- **Flaky `SQLITE_BUSY` test failures** — the local SQLite file had no `busy_timeout`, so concurrent connections (multiple vitest forked test files, or concurrent dev-server requests) could fail immediately instead of waiting for the lock. Fixed once in `src/lib/db/index.ts` rather than in test setup, since the same race is latent in local dev under concurrent requests too.

Added tests for previously-uncovered pure logic: `group.ts` (including a regression test for the genre-dedup bug above), `normalize.ts` (legacy-cache coercion), and `commerce/pricing.ts`, `commerce/currency.ts`, `commerce/credits-service.ts`. Suite went from 113 to 143 tests, all green across repeated runs.

**Still not covered by tests:** `scoreCandidates()` / `getQuizOnlyRecommendations()` in `engine.ts` (would need mocking Discogs/MusicBrainz/Last.fm/Apple Music clients — meaningful effort for a payoff not yet weighed against just re-reading the code), and anything requiring a real Spotify OAuth session (listening-intent row, wishlist, the Spotify-seeded recommendation path) — manual verification here was guest-mode only.

## Database schema

Schema: `drizzle/schema.ts`. Latest migration: `drizzle/migrations/0007_thick_lake.sql`.

| Table | Purpose |
|-------|---------|
| `taste_profile` | Quiz summary (genres, decades, moods, album preference, deep-cut level) |
| `quiz_responses` | Sub-genres + album battle preferences |
| `spotify_snapshot` | Full listening snapshot + derived `taste_vector` |
| `recommendation_cache` | Scored `Recommendation[]`, 1h expiry |
| `recommendation_feedback` | like / dislike / own / hide per release |
| `wishlist_items` | Saved vinyl releases + `priceAtAdd`/`lastAlertedPrice` for price-drop alerts |
| `price_history` | Daily price snapshots for wishlisted releases (deduped across users) |
| `offer_cache` | DB-backed cache for the "where to buy" panel — `Offer[]`/`SourceStatus[]` JSON, 6h expiry |
| `local_shops` | Registered local-shop Shopify storefronts for the "where to buy" panel — see "eBay + affiliate tagging + local-shop sources". Empty by default; no self-serve claim flow yet |
| `users`, `credit_ledger`, `orders` | Auth + credits + reservations |

Queries: `src/lib/db/queries.ts`. Migrations run on app startup via `src/lib/db/index.ts`.

**Note on migration history:** `0004_taste_intelligence.sql` predates a snapshot file (`drizzle/migrations/meta/0004_snapshot.json` is missing — it was hand-authored rather than generated). Running `npm run db:generate` after `0004` will therefore bundle old, already-applied statements into the new migration's diff (drizzle-kit falls back to diffing from `0003`'s snapshot). If this happens again, hand-trim the generated file down to just the genuinely new statements before committing — same as was done for `0005`.

## Key files

| Area | Path |
|------|------|
| Recommendation orchestration | `src/lib/recommendations/load.ts` |
| Scoring + reasons | `src/lib/recommendations/engine.ts` |
| Score normalization / fair value | `src/lib/recommendations/finalize.ts`, `fair-value.ts` |
| Dedup + genre diversity | `src/lib/recommendations/dedupe.ts` |
| Listening-intent nudges | `src/lib/recommendations/listening-intent.ts` |
| Discogs matching | `src/lib/recommendations/match.ts` |
| Discogs client (search, release, marketplace, master versions) | `src/lib/discogs/client.ts` |
| Weighted sampling (browse variety) | `src/lib/utils/weighted-sample.ts` |
| Discover UI grouping/filtering | `src/lib/recommendations/group.ts`, `filter.ts` |
| Spotify fetch + discovery seeds | `src/lib/spotify/client.ts` |
| Spotify sync | `src/lib/spotify/sync.ts` |
| Taste vector derivation | `src/lib/taste/derive-profile.ts` |
| Types | `src/lib/types.ts` |
| Auth + guest merge | `src/lib/auth.ts`, `src/lib/identity.ts` |
| Commerce | `src/lib/commerce/` |
| Theming + ambient scene | `src/lib/themes.ts`, `src/components/theme-provider.tsx`, `src/components/noir/noir-atmosphere.tsx`, `src/components/home/noir-hero.tsx` |
| App shell + nav | `src/components/app-shell.tsx`, `src/components/app-nav.tsx`, `src/components/mobile-nav.tsx` |
| Album detail (presentation) | `src/components/album/album-detail.tsx`, `src/components/album/album-actions.tsx` |
| Pressing details / compare pressings | `src/components/album/pressing-details.tsx`, `compare-pressings.tsx` |
| "More like this" (Suspense-streamed) | `src/components/album/similar-releases.tsx` |
| Home listening-intent row (Suspense-streamed) | `src/components/home/listening-intent-row.tsx` |
| Discover cards / carousels | `src/components/discover/poster-card.tsx`, `carousel-row.tsx`, `discover-grid.tsx` |
| Catalog search | `src/lib/discogs/client.ts` (`searchCatalog`), `src/components/search/search-feed.tsx`, `src/app/(app)/search/page.tsx` |
| Album back-navigation (context-aware) | `src/components/album/back-link.tsx` |
| Price history / real fair value | `src/lib/db/queries.ts` (price-history functions), `src/lib/recommendations/fair-value.ts` (`applyHistoricalFairValue`) |
| Price-drop alerts | `src/lib/commerce/price-alerts.ts` (pure logic), `src/lib/email/price-drop-alert.ts` (template), `src/lib/email/send.ts` (Resend wrapper), `src/app/api/cron/snapshot-prices/route.ts` |

## API routes

| Route | Notes |
|-------|-------|
| `GET/POST /api/quiz` | Save taste profile + quiz responses |
| `GET/POST /api/spotify/top` | Sync listening snapshot (POST = force) |
| `GET/POST /api/recommendations` | Load/regenerate picks (`maxDuration: 60`) |
| `POST /api/feedback` | Recommendation signals; clears cache |
| `GET/POST/DELETE /api/wishlist` | Auth required; `POST` now also captures `priceAtAdd` |
| `POST /api/reservations` | Spend credits on listing hold; response now includes a fresh `reservationCount` for that release |
| `GET /api/discogs/search` | Full-catalog vinyl search, guest-accessible, no auth (`maxDuration: 30`) |
| `GET /api/discogs/release`, `/marketplace` | Release, marketplace proxies |
| `GET /api/cron/snapshot-prices` | Vercel Cron only — `Authorization: Bearer $CRON_SECRET` (`maxDuration: 120`) |

## Environment

Copy `.env.example` → `.env.local`. Required for full functionality:

- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `AUTH_SECRET`
- `DISCOGS_TOKEN`
- `DATABASE_URL` (defaults to local SQLite file)

Optional: `LASTFM_API_KEY` (similar-artist discovery), `TURSO_*` (persistent prod DB), `CRON_SECRET` (required for `/api/cron/snapshot-prices` to accept requests — see "Price history & deals"), `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (price-drop alert emails; omitted = cron still snapshots prices, just skips sending), `SERPAPI_KEY` (Google Shopping meta-search for the album "Where to buy" panel; omitted = panel shows the Discogs offer only), `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` (eBay Browse API offer source; omitted = source skipped), `EBAY_CAMPAIGN_ID` (eBay Partner Network affiliate tagging; only meaningful with the eBay creds above), `SKIMLINKS_PUBLISHER_ID` (affiliate-tags Google Shopping / local-shop offer links via Skimlinks; omitted = those links stay direct, no affiliate disclosure shown) — see "eBay + affiliate tagging + local-shop sources".

A missing `DISCOGS_TOKEN` fails fast with an actionable error (pointing at discogs.com/settings/developers) instead of a cryptic upstream `401 Invalid consumer token` — a personal access token is enough; no app registration needed. Note `.env.local` is per-directory, so each git worktree needs its own copy.

## Local dev

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npm run db:push      # sync schema to local DB
npm run build        # production build
```

If schema is behind after pulling, migrations apply on first `npm run dev`, or run:

```bash
sqlite3 data/record_finder.db < drizzle/migrations/0004_taste_intelligence.sql
npm run db:push
```

## Deferred / not yet built

| Item | Notes |
|------|-------|
| **Playlist import** | Needs `playlist-read-private` OAuth scope; existing users must re-auth |
| **Artist recognition grid** | "Own on vinyl / seen live" quiz step from roadmap |
| **Vinyl format preference** | Original pressings vs reissues quiz step |
| **ML / embeddings** | Still rule-based heuristic scoring; no learned weights |
| **A/B metrics** | No instrumentation for like-rate or reason-quality success metrics yet |
| **Hard-capped reservations** | Reservation scarcity currently only shows a count ("N collectors reserved a spot"); there's no cap and a reservation never blocks. If real scarcity is wanted, decide between a flat per-release constant or `min(numForSale, X)` before implementing |
| **Cross-browser-engine testing** | UI/mobile verification in this repo has been done via the Chromium-based preview tooling only (viewport resizing for mobile/tablet); Firefox/Safari rendering has not been separately verified |
| **Verified email sending domain** | Price-drop alerts work end-to-end locally, but Resend (like any transactional email provider) requires a verified sending domain before it can email real users — currently only the developer's own Resend-verified address can receive mail |
| **Live Vercel deployment** | The cron schedule in `vercel.json` only actually fires once deployed with `CRON_SECRET` set in the project's env vars — this is still a local-dev-only project |

## Recommended next steps

North star: best vinyl-searching site + best deals on vinyl. Roughly in priority order:

1. ~~**Full-catalog search**~~ — done, see "Catalog search" above.
2. ~~**Real price-history fair value + price-drop email alerts**~~ — done, see "Price history & deals" above. Two follow-ups worth doing before this compounds much further: verify a sending domain with Resend (real user emails don't work without it), and deploy to Vercel with `CRON_SECRET` set so the daily snapshot job actually starts running.
3. **Instrument the success metrics that already exist on paper** (see "Success metrics" below) — including for Search (search → click-through → reservation funnel) and for the new alerts (email → click-through → reservation). Every scoring/ranking/alerting decision is a guess without this data.
4. **Round out the quiz** with the two deferred steps (artist recognition grid, vinyl format preference) — cheap, additive, and both directly feed scoring signals that already exist in the engine.
5. **Decide reservation scarcity's teeth.** Right now it's a count with no cap — fine as a nudge, but if the product goal is real urgency, decide between a flat per-release constant or `min(numForSale, X)` and implement the cap.
6. **Playlist import** — highest user-visible payoff of the deferred Spotify-scope work, but forces a re-auth for existing connected users, so bundle it with another scope-touching change rather than shipping alone.
7. **ML/embeddings and cross-browser QA** are lower priority right now: the heuristic scoring is legible and debuggable (a real advantage while the product is still finding its shape), and the app is Chromium-verified with no reported cross-engine issues — revisit both once the metrics in (3) show the heuristic approach actually plateauing.

## Known constraints

- **Spotify rate limits** — sync batches parallel fetches; 24h snapshot TTL; 1h recommendation cache
- **Discogs rate limit** — global 1 req/sec throttle (`discogsThrottle`); any new per-item enrichment (e.g. compare-pressings pricing) must be designed around this — see why `getMasterVersions()` deliberately skips per-version price fetches, and why the price-snapshot cron caps itself at 100 releases/run
- **Discogs is slow** — scoring does up to 25 vinyl lookups; generation is client-triggered to avoid serverless timeouts
- **Guest wishlist** — requires sign-in; quiz and recommendations work for guests
- **Quiz-only path** — no longer purely positional (`50 - index`): now gets weighted-sample browse variety, mood/format/deep-cut fit, and feedback signals like the Spotify path does, but still lacks the richer Spotify-derived taste-vector signals (artist/album affinity, recent rotation, Last.fm similarity)
- **Real fair value only covers wishlisted releases** — see "Price history & deals" above; everything else still gets the batch-relative badge
- **Local SQLite under concurrency** — the local file (both `record_finder.db` and the vitest throwaway db) now sets `PRAGMA busy_timeout` on connect so concurrent writers wait instead of throwing `SQLITE_BUSY` (see "Polish & hardening pass" above); WAL mode was deliberately not also enabled, since the mode switch itself needs a brief exclusive lock and caused the exact startup race it would be meant to fix
- **`/search` is public with no abuse protection** — the route is guest-accessible by design, but nothing beyond the shared `discogsThrottle` limits one client from monopolizing the app's whole Discogs request budget (quiz-gating incidentally did this for Discover before). See "Catalog search" above.
- **Price-drop emails need a verified sending domain** — see "Price history & deals" above and the new Deferred entry.

## Success metrics (from roadmap — not instrumented yet)

- % of recommendations with specific reasons citing saved/recent/core taste
- Feedback `like` rate: Spotify-connected vs quiz-only
- Sync completion rate and time-to-first-recommendation after connect
