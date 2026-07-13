# Record Finder — Handoff

Last updated: 2026-07-13

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
Home → Taste Quiz (11 steps, 2 optional) → Discover → Album detail
         ↓ optional, mid-quiz or anytime
    Spotify connect → full listening sync → sharper picks

Search (guest, no quiz) → Album detail
```

1. **Search** (`/search`) — full-catalog Discogs vinyl search, no quiz or sign-in required. See "Catalog search" below.
2. **Quiz** (`/quiz`) — genres, self-rated experience level + optional birth decade, optional mid-quiz Spotify connect, sub-genres, decades, moods, recognized artists, album A-vs-B battles, listening style, format preference, deep-cut slider. Guests get a signed cookie ID; data persists without sign-in. See "Quiz redesign" below for the experience-level/Spotify-tailoring details.
3. **Spotify connect** — OAuth scopes: `user-top-read`, `user-read-recently-played`, `user-library-read`. Sync runs on home page connect and before recommendation generation when snapshot is stale (24h).
4. **Discover** (`/discover`) — requires completed quiz. Reads recommendation cache on SSR; client triggers `POST /api/recommendations` if empty (~25s Discogs pass). A local-filter miss ("no matches in your picks") links out to `/search?q=...` for the full catalog.
5. **Album** (`/album/[id]`) — Discogs release detail, feedback (like/dislike/own/hide), wishlist (signed-in), reserve with credits, Spotify link. Reachable from Discover, Search, or Wishlist; the back link (`album/back-link.tsx`) goes to whichever one you came from via browser history, falling back to Discover on a direct link.
6. **Wishlist** (`/wishlist`) — requires Spotify sign-in.
7. **Profile** (`/profile`) — works for guests too (reads whatever `getCurrentUserId()` resolves to). Consolidates taste-profile summary, quiz retake, `SpotifyConnect`, and (signed-in only) wishlist/credits shortcuts and Spotify sync stats — see "Profile page" below.

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

**Finalize / score normalization** (`src/lib/recommendations/finalize.ts`) — `finalizeScores(recs, deepCutLevel, weights)` blends four batch-relative components into a 0–100 score:
- **Relevance** (default weight 0.4): the raw per-candidate `score` above — everything except quiz signals (artist/album affinity, saved-album, recent rotation, Last.fm similarity, community rating bump, feedback) — min-max normalized within the batch
- **Quiz fit** (0.2): `quizScore` — decade, quiz-genre, sub-genre, mood, format, deep-cut appetite, album-battle preference — min-max normalized **separately** from relevance. See "Quiz vs. Spotify weight rebalance" below for why this is a dedicated component rather than folded into relevance.
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

- **`searchCatalog(query, page)`** (`src/lib/discogs/client.ts`) — hits `/database/search` with relevance-default sort (not `sort=want`, so a literal title/artist search surfaces the actual match first), page size 24 (`SEARCH_PER_PAGE` — see "Fixing 'limited results'" below for why this isn't as small as it used to be). Returns results in the existing `Recommendation` shape (via a private `searchResultToSearchHit`, parallel to but distinct from `searchResultToRecommendation` — a search hit has no personalized "reason") plus a `SearchPagination` envelope (`src/lib/types.ts`).
- **`GET /api/discogs/search`** — rewritten (previously raw Discogs JSON passthrough); validates and clamps the query, enriches the page with `enrichRecommendations()` (price/rating), and flags fair value on that page-batch — batch-relative by default, upgraded to real historical fair value wherever price history exists (see "Price history & deals" below). `maxDuration = 30`, matching `/api/recommendations`'s precedent for a rate-limited Discogs pass.
- **`/search` page + `SearchFeed`** (`src/components/search/search-feed.tsx`) — input, `VinylLoader` (~13s for a full page — see "Fixing 'limited results'" below for the current enrich-a-subset tradeoff, updated from the original all-enriched design), `DiscoverGrid` reused as-is for results, prev/next pagination, genre/decade/sort filters (see "Search filters" below). No genre-row grouping or view-mode toggle — deliberately thinner than Discover.
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

## Production crash fix + recommendation-reason transparency (2026-07-09)

- **Production bug**: `record-finder-nine.vercel.app` crashed on load (`TypeError: Cannot read properties of undefined (reading 'length')`) for Spotify-connected sessions only. Root cause: `parseJson<T>()` (`src/lib/utils.ts`) called `JSON.parse(value)` without checking for `null` first — `JSON.parse(null)` coerces to `JSON.parse("null")`, which is valid JSON and successfully returns `null` instead of throwing, silently bypassing the `fallback` argument. A DB column that's genuinely SQL `NULL` (an old production row predating some field, per the migration-history quirk noted below) came through as JS `null` and this array field then hit `.length` downstream. Fixed with an explicit `value == null` guard before parsing; regression-locked in `src/lib/utils.test.ts`. On top of this, further hardening was added directly in `src/lib/db/queries.ts` (`parseJsonArray<T>()`, `normalizeTopByTerm()`) to coerce non-array parse results to the fallback throughout `getSpotifySnapshot()`/`saveSpotifySnapshot()`.
- Diagnosed via `vercel logs --json <url>` (exact error digest match) rather than guessing; the underlying `JSON.parse(null)` quirk was independently confirmed with a bare Node one-liner before touching app code.
- Also discovered the production alias wasn't tracking the branch's latest deploy (it had been manually pointed at an older deployment tagged `preview`, not `production`, at some earlier point) — fixed via `vercel alias set <new-deployment-url> record-finder-nine.vercel.app`. Worth checking after future pushes: a push to this branch does not by itself guarantee the live alias updates.

- **Recommendation-reason transparency**: user's actual complaint after the algorithm-optimization request was "I can't tell what the quiz is doing vs my Spotify recommendations" — not a request to change scoring weights yet. Root-caused to two compounding UI/logic bugs, both now fixed (weight rebalancing itself is explicitly deferred — see below):
  1. `PosterCard` (`discover/poster-card.tsx`) only ever rendered `rec.reasons[0]`.
  2. `buildReasons()` (`recommendations/engine.ts`) pushed reasons in a fixed priority order that front-loaded Spotify-derived checks (top-artist, saved-album, recent-play, core-artist) before quiz-derived ones (decade, genre, mood) — so `reasons[0]` was almost always Spotify-flavored for a connected user even when quiz signals also applied underneath.
  - Fix: `buildReasons()` split into two new exported pure functions — `collectReasonBuckets()` (categorizes each reason string into `spotify`/`quiz`/`community` buckets; same exact wording as before) and `interleaveReasons()` (round-robins across the three buckets instead of concatenating them, falls back to `"Recommended based on your taste profile"` when all are empty). `PosterCard` now renders `rec.reasons.slice(0, 2)` as two independently line-clamped lines instead of one.
  - Note: the deep-cut-preference reason ("A lesser-known pressing, per your deep-cut preference") is bucketed under `quiz`, not `community`, even though it depends on want-count data — because the reason it's explaining is the user's quiz deep-cut-slider answer.
  - 7 new tests in `engine-helpers.test.ts` (241 total project tests). Verified live: regenerated real quiz-only recommendations via `/api/quiz` + `/api/recommendations`, confirmed reasons interleave correctly in the raw API response, and visually confirmed on `/discover` (desktop + 375px mobile) that poster cards show two distinct reason lines with no layout breakage. The Spotify-connected interleave path itself is unit-tested only, not live-verified (no Spotify OAuth session available in this environment).
  - Committed as `c0e609c`, pushed to `discover-differentiation-features`.

### Quiz vs. Spotify weight rebalance (2026-07-09, later)

Phase 2 of the same request — after shipping visibility, the user chose to move straight into rebalancing (didn't wait to observe first, contrary to the original "both, in that order" plan; asked "let's move onto the next thing" and picked this from a menu of options).

- **Problem**: even after the visibility fix, quiz signals were diluted rather than weighted. `finalizeScores()`'s `relevance` term was one combined `score` number where Spotify-derived deltas (artist affinity up to +30, album affinity +25, saved-album +20, recent-play +12, Last.fm similarity +12) had much higher density and variance than quiz-derived deltas (decade +15 flat, mood up to +24, genre matches, deep-cut ±8) — batch min-max normalization means whichever signal has the widest spread across a batch dominates the normalized 0–1 relevance score, regardless of the nominal point values. For a Spotify-connected user, every candidate is already Spotify-seeded, so this systematically drowned out quiz answers even where they applied.
- **Fix**: split the single raw `score` into two tracked components in `src/lib/recommendations/engine.ts` — `score` (Spotify listening-history + community + feedback signals) and a new `quizScore` field (decade, quiz-genre — split out of the old combined `genreOverlap` into `quizGenreOverlap`/`spotifyGenreOverlap` — sub-genre, mood/format/deep-cut via `quizAffinityAdjustment`, album-battle preference). Both `scoreCandidates()` (Spotify path) and `getQuizOnlyRecommendations()` (quiz-only path) now populate `quizScore` independently of `score`.
- `finalizeScores()` (`finalize.ts`) gained a fourth weighted, independently batch-normalized component, `quizFit` (`quizFitScores()`, same min-max treatment as relevance). New `DEFAULT_FINALIZE_WEIGHTS`: relevance 0.4 (was 0.6), quizFit 0.2 (new — carved entirely out of relevance's old share, rating/desirability untouched), rating 0.3, desirability 0.1. This guarantees quiz answers move the final score by a fixed, real proportion for every Spotify-connected user, rather than a proportion that depends on how much variance happens to exist in that batch's Spotify signals.
- Added `Recommendation.quizScore?: number` (`src/lib/types.ts`).
- 3 new tests in `finalize.test.ts` (isolating quizFit via zeroed other weights, undefined-quizScore-defaults-to-0, and a comparative test proving the default weights close a relevance gap more than a config with `quizFit: 0` does) — 244 total project tests, all green, alongside clean `tsc`/lint.
- Verified live (quiz-only path only — no Spotify OAuth session available here, same caveat as the visibility fix): regenerated real recommendations, confirmed scores stay a valid 0–100 range and reasons still interleave correctly, screenshotted `/discover` grid view showing intact two-line reasons and price/rating badges.
- **Not yet verified**: the actual before/after ranking shift for a real Spotify-connected account — the user should check their own Discover picks and confirm quiz answers now visibly move which albums surface, and report back if the 0.2 `quizFit` weight feels like too much or too little.

## Reservation scarcity cap + rounding out the quiz (2026-07-09, later)

Three items pulled from "Recommended next steps" in one batch, per user request ("let's do all of those").

**Reservation scarcity cap** — `getReservationCountForRelease()` used to be display-only (no cap, a reservation never blocked). Now enforced:
- `reservationCapForRelease(numForSale)` (`src/lib/commerce/reservations.ts`, pure, tested) — `min(numForSale, 5)`. Capped at 5 regardless of listing volume so the cap stays meaningful on releases with hundreds of copies for sale; tied to real Discogs inventory below that.
- `POST /api/reservations` checks the cap **before** deducting credits (409 `"All concierge queue spots for this release are taken"` if full) — a real block, not just a warning after the fact.
- `ReserveWithCreditsButton` shows a disabled "Full" / "Fully reserved" state once `reservationCount >= cap`, and handles a race-condition 409 from the server the same way. Also fixed a pre-existing gap while touching this file: the non-compact modal never rendered the "N collectors already reserved a spot" badge at all (only the compact variant did) — now both do.
- Known limitation, accepted: the cap check and the credit deduction aren't in one DB transaction, so two concurrent requests at the last spot could both pass the check — not addressed, consistent with this app's existing pragmatic (non-transactional) reservation flow.

**Quiz round-out** — the two deferred quiz steps from the roadmap, both now feeding real scoring signals, not just collected and ignored:
- **Artist recognition grid** (`src/lib/quiz/recognized-artists.ts` — curated ~3 well-known artists per genre, same hand-curated pattern as `album-battles.ts`) — a new "Know these artists?" step where the user marks artists as "Own on vinyl" and/or "Seen live" (independent toggles, not mutually exclusive). Stored in `quiz_responses.recognized_artists` (migration `0008_loud_hammerhead.sql`) as `{ owned: string[], seenLive: string[] }`. Scored via new `buildQuizArtistAffinity()`/`quizArtistAffinityAdjustment()` in `engine.ts` — seen-live weighted slightly above owned (+12 vs +10; a harder, more deliberate fandom signal) — folded into `quizScore` (not `score`), consistent with the quiz/Spotify split above. Also surfaces as a reason ("You already own X on vinyl" / "You told us you've seen X live"), seen-live taking priority when both apply.
- **Format preference** (originals vs. reissues) — a new single-select step alongside the existing listening-style (`albumPreference`) step, stored as `taste_profile.format_preference` (same migration). New `isReissue(formats)` in `match.ts` (checks for "reissue"/"repress"/"remaster" in Discogs format descriptions, mirroring the existing `isFullAlbum()` pattern) feeds a new branch in `quizAffinityAdjustment()`: originals-lovers take a real penalty (-10) on a reissue; reissue-lovers take a lighter penalty (-3) on an original (an original pressing isn't really a downgrade, so the mismatch matters less).
- Both `scoreCandidates()` (Spotify path) and `getQuizOnlyRecommendations()` (quiz-only path) now thread `recognizedArtists` through; `load.ts` passes `quizResponses?.recognizedArtists` to all three `getQuizOnlyRecommendations()` call sites.
- 261 total tests (up from 248), clean `tsc`/lint. Verified live: stepped through the full 9-step quiz in-browser (was 7), confirmed "Step 1 of 9" through "Step 9 of 9", toggled artist recognition and format preference, and confirmed via the raw `GET /api/quiz` response that both persisted and round-tripped correctly (`formatPreference: "reissues"`, `recognizedArtists: { owned: [...], seenLive: [...] }`).
- **Not yet verified**: the actual scoring effect on a real Spotify-connected account's Discover picks (same caveat as the weight-rebalance work above — no Spotify OAuth session available in this environment).

## Success-metrics instrumentation (2026-07-09, later)

The third item from this batch — turns the roadmap's "Success metrics" section (previously "not instrumented yet") into real, queryable data. Deliberately a raw event log + pure aggregation functions, **no dashboard UI** (not requested, and premature before it's clear which of these metrics end up mattering).

- **`analytics_events` table** (migration `0009_bitter_famine.sql`) — flat log: `userId`, `type`, `metadata` (JSON), `createdAt`, indexed on both `type` and `userId`. A flat log rather than per-metric counter tables, since which metrics matter is still evolving and a log can be re-aggregated any way later without a schema change.
- **`logEvent(userId, type, metadata)`** (`db/queries.ts`) — wrapped in try/catch, never throws (same philosophy as the Resend email wrapper: a logging failure must never break the feature it's instrumenting).
- **Pure aggregation** (`src/lib/analytics/metrics.ts`, fully unit-tested, no DB access) — `computeReasonCitationRate()`, `computeFeedbackLikeRate()`, `computeSyncToFirstRecommendation()`, and a generic N-stage `computeFunnel()` (used for both the search and email funnels rather than writing two near-identical functions). DB-facing wrappers (`getReasonCitationRate()`, `getFeedbackLikeRateBySource()`, `getSyncToFirstRecommendationStats()`, `getSearchToReservationFunnel()`, `getEmailToReservationFunnel()` in `queries.ts`) fetch + call these — a script/REPL can call them directly today; there's no route exposing them yet.
- **Instrumented events**:
  - `recommendations_generated` (`load.ts`, after a real generation — not on cache hits) — `{ source: "spotify"|"quiz-only", count, withSpotifyReason }`. `withSpotifyReason` comes from a new `hasSpotifyReason(reasons)` in `engine.ts` (checks a fixed list of the exact prefixes `collectReasonBuckets` pushes into its `spotify` bucket) — this is what "% of recommendations with specific reasons citing saved/recent/core taste" is computed from.
  - `spotify_sync_completed` (`load.ts`, right after a successful sync) — `{ durationMs, artistCount }`.
  - `feedback_given` (`POST /api/feedback`) — `{ signal, connected }`, `connected` from a live `auth()` check, not inferred — feeds the Spotify-connected-vs-quiz-only like-rate split.
  - `search_performed` (`GET /api/discogs/search`, page 1 only — pagination shouldn't inflate the funnel's "searched" count) — `{ resultCount }`.
  - `search_result_click` (client-side — `PosterCard` gained an optional `onNavigate` prop, threaded through `DiscoverGrid`'s new `onItemClick` prop; only `SearchFeed` wires it up, Discover doesn't, so the funnel stays search-specific) — fires a non-blocking `navigator.sendBeacon` (fetch-with-`keepalive` fallback) to the new `POST /api/analytics/event`.
  - `reservation_created` (`POST /api/reservations`, on success) — `{ discogsReleaseId }`.
  - `price_drop_email_click` — the price-drop email's album links now carry `?src=price-drop-email` (`email/price-drop-alert.ts`); the album page route reads it server-side and logs when present.
- **`POST /api/analytics/event`** — the only client-reachable logging path, validated against a small `CLIENT_LOGGABLE_EVENT_TYPES` allowlist (`lib/analytics/types.ts`, currently just `search_result_click`) so a client can't forge a `reservation_created` or similar server-trusted event.
- 12 new unit tests (`metrics.test.ts`) + 3 new integration tests (`queries.test.ts`, real DB round-trip) — 277 total tests, clean `tsc`/lint.
- **Verified live end-to-end** (not just unit-tested): ran a real search, clicked a result, and confirmed both `search_performed` and `search_result_click` landed in the dev SQLite file under the *same* guest id (proving the funnel is actually joinable); regenerated quiz-only recommendations and confirmed `recommendations_generated` logged `{"source":"quiz-only","count":22,"withSpotifyReason":0}`; submitted feedback and confirmed `{"signal":"like","connected":false}`.
- **Not yet verified**: the Spotify-connected variants of these events (`connected: true`, `source: "spotify"`) and the email-click path — all three need either a real Spotify OAuth session or a real Resend send, neither available in this environment.
- **Sync completion rate** (one of the two things named under that roadmap bullet) is deliberately *not* computed — there's no reliable "sync attempted" denominator for syncs that failed before this instrumentation existed, and a sync failure already surfaces to the user via the existing `degraded` error path, so it's not silently invisible. Time-to-first-recommendation is the half of that metric this ships.

## Fixing "limited results" on Discover and Search (2026-07-09, later)

User-reported: Discover felt thin (few picks to browse) and Search felt capped. Root-caused to three separate, compounding issues — not one bug — across generation, display, and pagination.

- **The real bug: `groupRecommendations()` was starving its own rows.** (`src/lib/recommendations/group.ts`) The "Top picks" row took the 12 highest-scoring picks *out of the shared pool* before genre/decade/deep-cut rows were built. With a total batch of only ~22-25 recs, Top Picks alone consumed over half the pool, so most other rows fell below `MIN_ROW_ITEMS` (3) and simply didn't render — the feed collapsed to "Top picks" + a thin "More to explore," no matter how much was actually generated. Fix: Top Picks is now a highlight reel, not a claim — its items stay eligible for genre/decade/deep-cut rows too (an item can headline "Top picks" *and* appear in its "Rock" row, same as any Netflix-style browse UI). The catch-all "More to explore" row still excludes Top Picks specifically, so it doesn't just silently re-list the same 12 items. One new test (`group.test.ts`) locks in both halves: top-picks *can* overlap with a thematic row, but every other row still partitions the pool exclusively.
- **Raised the generation pool sizes**, since there was real headroom once the DB-level cause above was ruled out as a compounding contributor:
  - Quiz-only: `browseByGenreDecade()` call in `getQuizOnlyRecommendations()` raised 25→40. This is *cheap* — the function's Discogs call count is fixed at up to 6 (one per genre×decade combo) regardless of the limit; only the downstream per-pick enrichment call count scales.
  - Spotify-connected: `fetchDiscoveryAlbums()` limit 30→40, `scoreCandidates()`'s candidate slice 25→35. This *is* a real Discogs-call cost increase (one call per candidate match, unavoidable). `/api/recommendations`'s `maxDuration` raised 60→90 for headroom.
  - **Verified live**: quiz-only generation went from ~22 recs to **36**, completing in ~40-43s (well under the new 90s ceiling, up from a prior ~25-30s at the lower cap). Discover then rendered **Top picks (12), Rock (12), Indie (12), Indie Rock (11)** — every row fully populated, vs. the old "Top picks + maybe one thin row" experience.
  - **Not verified**: the Spotify-connected path's actual timing/count at the new caps — no OAuth session available in this environment. The math checks out (documented inline at the `maxDuration` change) but hasn't been observed end-to-end.
- **Decoupled Search's result count from its enrichment cost.** `SEARCH_PER_PAGE` was hardcoded to 10 purely to bound per-item Discogs enrichment cost (1 call each, serialized). But the base `/database/search` call itself costs the same *one* Discogs request regardless of `per_page` (up to Discogs' own ceiling) — there was no reason the visible result count had to equal the enriched count. Fix: `SEARCH_PER_PAGE` raised to 24; a new `SEARCH_ENRICH_LIMIT` (12) in `/api/discogs/search/route.ts` fully enriches only the first 12 (price/rating/fair-value), leaving the rest as browsable cards with title/artist/cover/year/genre/want-count (all free from the search call itself) but no price badge — clicking through still fully enriches that one release via the album page's own `getRelease()` call. Order is preserved (a straight slice + concat, not a re-sort).
  - **Verified live**: a "beatles" search now returns 24 results (was 10) in ~13s (about the same wait as before, since only 12 are enriched — confirmed the 13th+ results in the DOM render with "View album" instead of a price badge, exactly as designed).
- 1 new unit test (`group.test.ts` rewritten), 1 test fixture update (`discogs/client.test.ts`'s stale `perPage: 10` expectation) — 277 total tests, clean `tsc`/lint throughout.

## Search filters — genre, decade, sort (2026-07-09, later)

Follow-up to the "limited results" fix: user wanted Search to be "smarter... with filters and everything." Scoped deliberately to what's actually correct for a server-paginated, full-catalog search — not a straight port of Discover's filter UI.

- **Why Discover's filter model doesn't transfer directly**: `DiscoverFilterState` (`min rating`, `max price`, `for sale only`, `good value only`, `format`) all filter an already-fully-enriched, fully-fetched, in-memory array — correct because Discover's ~36 picks are *all* enriched before reaching the client. Search's catalog can be 25,000+ items across 400+ Discogs-paginated pages, with only the first 12 of each 24-item page enriched (see the "limited results" fix above) — filtering by price/rating client-side would silently only ever look at 12 items out of tens of thousands, giving a badly incomplete result with no way to signal that to the user. So these were **not** added to Search; only filters Discogs' own search API genuinely supports catalog-wide were.
- **Verified live against the real Discogs API before writing any UI** (not assumed from docs): `genre=`, `style=`, `year=`, `sort=`+`sort_order=` all confirmed as real, correctly-filtering/ordering params. Crucially, discovered that **many of this app's `QUIZ_GENRES` values aren't valid Discogs `genre=` values at all** — `genre=Alternative`, `genre=Punk`, `genre=Metal`, `genre=Indie`, `genre=R%26B` all silently returned **0 results** (they only exist in Discogs' separate, larger `style` taxonomy — e.g. "Alternative Rock", "Heavy Metal", "Rhythm & Blues" — while `genre=` is a small ~15-tag top-level list). Also confirmed Discogs has **no decade-range param** — only exact `year=`.
- **`GENRE_DISCOGS_PARAM`** (`src/lib/discogs/genre-map.ts`, new) — the verified mapping from every `QuizGenre` to the correct real field (`genre` or `style`) and value, so the UI can keep using this app's existing genre vocabulary while routing correctly under the hood. Unit-tested for completeness (every quiz genre has an entry) and for the specific genre/style split.
- **`searchCatalog()`** (`src/lib/discogs/client.ts`) gained an optional third `filters` param: `{ genre?, decade?, sort? }`. `genre` and `sort` become real query params (narrow/order the whole catalog, pagination included); `decade` is appended as a keyword token to the query text — same approximate pattern `browseByGenreDecade` already uses, since there's no real decade param to hook into. `SearchSortOption` (`relevance | most_wanted | newest | oldest | artist_az`) maps to verified `sort=want|year|artist` + `sort_order` combos.
- **`SearchFilters`** (`src/components/search/search-filters.tsx`, new) — a lighter filter bar than `DiscoverFilters`: sort dropdown + genre pills (all 18 `QUIZ_GENRES`, single-select) + decade pills (single-select). Same expand/collapse-with-active-count pattern as Discover for visual consistency. Wired into `SearchFeed`: changing a filter resets to page 1 and re-runs the search (only once a query has actually been submitted).
- **Fixed a real bug found via live testing, not spotted in review**: rapid filter clicks (a genre pill then a decade pill then the sort dropdown, in quick succession) fired multiple overlapping searches with no cancellation, all queuing on the shared 1-req/sec Discogs throttle — one test sequence took **37 seconds** to settle because five stale requests were still in flight ahead of the current one, any of which could have resolved last and clobbered the UI with stale results. Fixed with an `AbortController` in `SearchFeed`: each new search aborts the previous in-flight one first. Doesn't reduce Discogs quota usage (the aborted server-side call may still run to completion), but eliminates the stale-response race — verified live: a clean single filter change now resolves in ~13s again, same as an unfiltered search.
- 12 new unit tests (`genre-map.test.ts` + `client.test.ts` additions) — 285 total tests, clean `tsc`/lint.
- **Verified live end-to-end**: expanded filters, selected Jazz + 1960s + Most wanted on a "beatles" search, confirmed the exact expected query string (`genre=Jazz&decade=1960s&sort=most_wanted`) hit the API each time via server logs; confirmed toggling a pill off correctly dropped just that param while keeping the others.
- **Known limitation, by design, not an oversight**: no min-rating/max-price/for-sale/good-value filters on Search (see the "why" above) — those remain Discover-only, where the full result set is genuinely enriched.

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

## Netflix-style infinite scroll for Discover + Search (2026-07-13)

User complaint: Discover and Search felt "limited and minimal" despite the earlier "limited results" fix. Root cause this time wasn't count, it was distribution + a hard ceiling — `groupRecommendations()` still exclusively partitioned its pool across genre/decade/deep-cut rows, so one dominant genre (e.g. Rock) could claim 12 of ~36 items and starve the rest, and once the scored batch was exhausted there was nothing left to scroll to.

- **`group.ts` simplified further**: dropped decade rows and the "More to explore" catch-all entirely; kept only Top Picks + up to 2 scored genre rows + Deep Cuts, all now non-exclusive (a highlight reel over the shared pool, not a claim on it — same reasoning already applied to Top Picks, extended everywhere). Real breadth now comes from a second tier, not from subdividing a ~36-item batch further.
- **`src/lib/recommendations/browse-rows.ts`** (new) — `buildBrowseRowQueue()`, a pure function producing ~25-30 live-catalog row definitions: one per quiz genre/decade not already claimed by a scored row, then the full `QUIZ_GENRES`/`QUIZ_DECADES` taxonomy as fallback, then two evergreen rows ("Most wanted right now", "Fresh pressings"). Genuinely large enough that scrolling to the end takes real effort.
- **`src/components/discover/browse-row.tsx`** (new) — each queue entry is its own live Discogs query (`/api/discogs/search` with genre/decade/sort, no text query — `searchCatalog` already supported empty-query browse), fetched lazily on mount, independent of the scored batch's size.
- **Vertical infinite scroll**: `DiscoverFeed` mounts scored rows immediately, then lazily mounts browse-row queue entries as a bottom sentinel scrolls into view. **Horizontal infinite scroll**: `CarouselRow` gained `onLoadMore`/`hasMore`/`loadingMore` — scrolling a row to its end fetches that row's next page and appends.
- **New `src/hooks/use-in-view.ts`** — first `IntersectionObserver` usage in this codebase. Two real bugs found and fixed during live verification, not caught by unit tests:
  1. A generous `rootMargin` meant the sentinel could stay continuously intersecting as new content was added above it, so the naive version fired once and went silent (IntersectionObserver only calls back on a threshold *crossing*). Fixed by accepting a `resetKey` that disconnects/reconnects the observer on every successful load, forcing a fresh check.
  2. Search's sentinel only renders once `pagination` exists (after the first fetch resolves) — a plain object ref never picked up the late-mounting element. Fixed by returning a callback ref instead, which re-attaches the moment the element actually mounts.
- **Search** (`search-feed.tsx`) — replaced Prev/Next buttons with the same scroll-to-load-more pattern (`useInView` + append-mode `runSearch`), keeping the existing `AbortController` stale-response guard.
- Also fixed a real bug from this same pass: the "Most wanted right now"/"Fresh pressings" evergreen rows have neither genre nor decade, and `/api/discogs/search`'s validation only allowed an empty query alongside genre *or* decade — those two rows 400ed silently every time until the guard was relaxed to also accept a bare `sort`.
- Verified live end-to-end (screenshots + server-log timing) on both pages, at desktop and 375px mobile; 292 tests passing at the end of this pass. Committed as `13f0454`.

## Discover/Search loading performance (2026-07-13, later)

Follow-up: "is there any other way to get the loading quicker." Root cause wasn't Discogs being slow in general — it was the API blocking each row/page's entire response on serialized, uncached, rate-limited enrichment.

- **Two-tier enrichment cache** — in-memory (per-instance, `src/lib/utils/ttl-cache.ts`, generic TTL cache with in-flight de-dup, new) + a DB-backed `release_enrichment_cache` table (migration `0010`, mirrors `offer_cache`, survives serverless cold starts and is shared across instances). Also cached the account currency (`discogs/client.ts`), which was being re-derived via a full extra Discogs call on every single request even though it's fixed for the whole session.
- **`src/lib/recommendations/enrich.ts` rewritten** — `getEnrichmentForReleases()` batch-reads the DB cache in one query for a whole page/row, falls through per-miss to the (in-memory-cached) Discogs client, writes misses back to the DB fire-and-forget. `enrichRecommendations()` dispatches concurrently (`Promise.all`) instead of serially — cache hits resolve instantly instead of queuing behind misses; genuine misses are still correctly paced by the shared `discogsThrottle` regardless of concurrency.
- **Progressive loading, not just caching** — `/api/discogs/search` no longer enriches at all; it returns the raw list (one Discogs call) immediately. A new **`POST /api/discogs/enrich`** route (client sends back the `Recommendation[]` items it wants enriched, gets back the same shape with price/rating/fair-value filled in) is called as a background follow-up for just the items about to be visible (8 per Discover row, 12 per Search page — tuned down from the old flat 12 specifically for rows, since a carousel only shows ~5-6 at once). `browse-row.tsx`/`search-feed.tsx` render the fast list immediately and merge the enrichment patch in by id when it resolves.
- **Free parallelization**: the price-history DB lookup (`getPriceHistoryStatsForReleases`) only needs release ids, which are known before enrichment — moved to run alongside it (`Promise.all`) instead of after.
- **Verified live with real server-log timings**: identical repeat search 13.3s → 12ms; a fresh genre/decade browse-row search call ~13s → under 2s for the visible list (enrichment follows separately, 6-12s cold / 6-7ms cached); confirmed in the DOM that only the first N items per row/page get enriched, the rest correctly stay bare until scrolled into view.
- **Known tradeoff**: the in-memory tier resets on a serverless cold start and isn't shared across concurrent instances — real, but strictly better than the zero-caching baseline, and the DB tier covers the gap. 314 tests passing at the end of this pass. Committed as `d8e1b73`.

## Internal metrics dashboard + Spotify playlist import (2026-07-13, later)

Two items off "Recommended next steps," done together per user request.

**Metrics dashboard** (`/dashboard`) — surfaces the five success-metrics functions from the earlier instrumentation pass, previously script/REPL-only.
- **Gating**: this app has no role/permission system at all (confirmed by search before building — nothing "admin" anywhere). New `src/lib/admin.ts` (`isAdminEmail()`, pure, tested, fails closed if `ADMIN_EMAIL` is unset) checked in the page itself; a non-matching visitor (including a guest) gets a plain Next.js 404, not a "not authorized" message, so the route's existence isn't advertised. **Requires setting `ADMIN_EMAIL` in Vercel's project env vars** (to whichever email the site owner's Spotify account signs in with) — not yet done as of this writing, so `/dashboard` currently 404s in production for everyone, including the owner.
- **UI**: no chart library added — `src/components/dashboard/stat-tile.tsx` and `funnel-display.tsx`, built from existing `Card`/`Progress` primitives. Nav link (`dashboard-nav-link.tsx`, desktop-only, mirrors the `CreditsNavLink` pattern) only renders for a signed-in session; real enforcement is server-side.
- Verified live: guest visiting `/dashboard` gets a real 404 (confirmed via server logs) and the nav link correctly doesn't render for a guest. The actual authenticated dashboard content was **not** visually verified — a mid-session attempt to temporarily bypass the auth check just to preview it was correctly blocked by a safety check (disabling an access-control check isn't done without explicit sign-off, even reversibly), so this still needs a real admin-matching Spotify session to confirm.

**Spotify playlist import** — the highest-payoff deferred Spotify-scope item.
- `playlist-read-private` added to the OAuth scope string (`src/lib/auth.ts`). Spotify doesn't retroactively grant new scopes to existing sessions, so granted scope is now tracked on the session (`session.scope`, from `account.scope` at sign-in time, persists across token refreshes since Spotify's refresh response never includes `scope`). Already-connected users see a new opt-in "Grant playlist access" prompt in `spotify-connect.tsx` (`signIn("spotify")` again — not a forced re-auth).
- **`fetchPlaylistLibrary()`** (`spotify/client.ts`) — up to 20 playlists, ~100 tracks each (single page, not deep-paginated), bounded concurrency (5) via the existing `mapWithConcurrency` util, deduped across playlists, never throws (a missing scope 403s and is caught, folded into `fetchFullListeningSnapshot()`'s existing tolerant-of-partial-failure pattern with zero new scope-flag plumbing needed).
- New `playlistTracks` field end to end: `spotify_snapshot.playlist_tracks` column (migration `0011`) → `SpotifyListeningSnapshot.playlistTracks` → **`derive-profile.ts`**: folded into `collectArtistWeights` (frequency-normalized, coefficient 0.2 — between the explicit-save 0.25 and passive-listen tiers) and `collectAlbumWeights` (flat 0.4 per unique album, below saved-album's 1.0). Routed through the taste vector, not new parallel lookups, so **the existing scoring engine (`engine.ts`) needed zero changes** to pick this signal up.
- Sync stats (`spotify-sync.tsx`) now mention playlist track counts when present.
- **Not verified live** (no Spotify OAuth session available in this environment, same recurring caveat as every other Spotify-connected code path in this repo): the actual scope-grant flow, real playlist fetch, and the taste-vector's effect on real Discover picks. Unit tests cover fetch pagination/bounding/dedup/failure-tolerance and the taste-vector weighting math (30 new tests total across both features, 329 total tests passing).
- Committed as `35384d8`.

## Profile page (2026-07-13, later)

Follow-up question after the above: "should we start adding in the profile section so we can save data?" — clarified via a quick multiple-choice check that this meant a UI hub for data that *already* persists (guest-cookie-to-account merge on Spotify sign-in already handles that), not a new non-Spotify account system.

- **`src/app/(app)/profile/page.tsx`** (new) — works for guests too. Shows the taste-profile summary (genre/decade/mood badges, listening style, pressing preference, deep-cut appetite) with a "Retake quiz" link, embeds the existing `SpotifyConnect` component as-is (so connect/reconnect/grant-playlist-access all just work here), and for signed-in users adds Spotify sync stats and clickable wishlist-count / credit-balance shortcut cards. Pure composition of already-tested data functions — no new logic, no new tests needed.
- Added to both `app-nav.tsx` and `mobile-nav.tsx` (now 6 tabs) since, unlike the dashboard, this is a mainstream feature for every user, not admin-only.
- Verified live: guest state renders correctly with real persisted quiz data from earlier in the session; confirmed at 375px that 6 mobile tabs still fit without overflow or breakage. Signed-in-only sections (wishlist/credits cards, Spotify sync stats) not visually verified — same no-OAuth-session caveat as above.

## Quiz redesign — experience level + Spotify-tailored questions (2026-07-13, later)

User complaint: the "own on vinyl / seen live" artist-recognition step and the album A-vs-B battles assume a level of music knowledge not every quiz-taker has — a newer or younger listener may not recognize either side of a curated classic-rock-skewing pool (e.g. Rock always showed Led Zeppelin/Stones/Fleetwood Mac), making the answer noise instead of signal.

- **New `background` step** (right after genres) — self-rated `experienceLevel` (`"new" | "casual" | "collector"`, new `TasteProfileData` field, migration `0012_silly_serpent_society.sql`, defaults `"casual"` for existing rows) plus an optional `birthDecade` pill (`BIRTH_DECADES` in `types.ts`, includes "Prefer not to say"). Neither blocks Continue — same no-forced-answer convention as every other step.
- **New `connectSpotify` step** — optional, skippable, placed early so its background sync has several steps to finish before the payoff steps are reached. Clicking through does `signIn("spotify", { callbackUrl: "/quiz?step=connectSpotify" })`; `quiz/page.tsx` reads `searchParams.step` to resume at the right position after the OAuth round-trip (progress itself was already safe — `mergeGuestData()` runs synchronously in the NextAuth `jwt` callback before redirect-back, confirmed via research before building this). The listening snapshot itself is populated by a **separate async client step** mirroring `SpotifySync`'s pattern (`POST /api/spotify/top`) — real few-second delay, shown via `VinylLoader`, never blocks Continue.
- **Spotify-tailored `recognizedArtists`/`albumBattles`** — when a pool is available (mid-quiz connect, or a pre-existing snapshot fetched server-side in `quiz/page.tsx`), those two steps source options from the user's own `topArtists.medium` and a saved-albums/top-tracks-derived album pool (`src/lib/quiz/spotify-pool.ts`, shared between server and client so the extraction logic isn't duplicated) instead of the generic curated pool — guaranteed-relevant since it's their own listening history. Copy changes to reflect this ("Here's what you've been playing" / "Which of your own favorites?").
- **Beginner-tier curated pools** — for users who skip Spotify and self-identify as `"new"`, `recognized-artists.ts`/`album-battles.ts` each gained a second, more contemporary/mainstream-skewing tier (`RECOGNIZED_ARTISTS_BEGINNER`, `ALBUM_BATTLE_PAIRS_BEGINNER`) selected via `pickRecognizedArtists(genres, experienceLevel, cap)` / `pickAlbumBattles(genres, experienceLevel, count)`. **Caveat**: these are a best-effort, point-in-time snapshot of "widely known right now," not an evergreen list — worth a periodic content refresh.
- **De-weighted quiz-only scoring** — `quizArtistAffinityAdjustment` (`engine.ts`) gained a `confidenceScale` param; `getQuizOnlyRecommendations` (the no-Spotify scoring path) passes `0.5` when `experienceLevel === "new"`, since a beginner's generic-pool recognition answer is noisier evidence than the same answer from someone experienced. `scoreCandidates` (the Spotify-seeded path) always passes the default `1` — if that path is running, a snapshot exists, meaning the recognized-artist/battle answers came from the user's own real data regardless of self-rated experience, which is inherently high-confidence. The album-battle match bonus/penalty only exists in `scoreCandidates` already, so it didn't need separate de-weighting.
- **Not fixed, flagged during this pass**: a latent dead-code bug in `derive-profile.ts` (album-battle winner/loser weights never apply to the Spotify taste vector because the synthetic `battle:<id>:A/B` ids never match real Spotify album ids) and the fact that 11 of 18 genres have zero curated album-battle pairs today (falls back to an unrelated genre's pair) — both pre-existing, out of scope for this pass.
- **Verified live**: the guest quiz path end-to-end (background step, skippable connectSpotify step via Continue, beginner-tier pool swap for `"new"`, unchanged pool for `"casual"`/`"collector"`), and `/profile` rendering the two new fields. **Not verified**: the actual mid-quiz Spotify OAuth round-trip and tailored-pool rendering — no real Spotify OAuth session available in this environment, same recurring caveat as every other Spotify-connected code path in this repo. Needs a real-account pass.

## Database schema

Schema: `drizzle/schema.ts`. Latest migration: `drizzle/migrations/0012_silly_serpent_society.sql`.

| Table | Purpose |
|-------|---------|
| `taste_profile` | Quiz summary (genres, decades, moods, album preference, format preference, deep-cut level, experience level, birth decade) |
| `quiz_responses` | Sub-genres + album battle preferences + recognized artists (`{owned, seenLive}`) |
| `analytics_events` | Success-metrics event log — see "Success-metrics instrumentation" |
| `spotify_snapshot` | Full listening snapshot + derived `taste_vector`; now also `playlist_tracks` (see "Spotify playlist import") |
| `recommendation_cache` | Scored `Recommendation[]`, 1h expiry |
| `recommendation_feedback` | like / dislike / own / hide per release |
| `wishlist_items` | Saved vinyl releases + `priceAtAdd`/`lastAlertedPrice` for price-drop alerts |
| `price_history` | Daily price snapshots for wishlisted releases (deduped across users) |
| `offer_cache` | DB-backed cache for the "where to buy" panel — `Offer[]`/`SourceStatus[]` JSON, 6h expiry |
| `local_shops` | Registered local-shop Shopify storefronts for the "where to buy" panel — see "eBay + affiliate tagging + local-shop sources". Empty by default; no self-serve claim flow yet |
| `release_enrichment_cache` | DB-backed cache for per-release price/rating/want/have, keyed on release + currency — see "Discover/Search loading performance" |
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
| Search filters + genre/style mapping | `src/components/search/search-filters.tsx`, `src/lib/discogs/genre-map.ts` |
| Album back-navigation (context-aware) | `src/components/album/back-link.tsx` |
| Price history / real fair value | `src/lib/db/queries.ts` (price-history functions), `src/lib/recommendations/fair-value.ts` (`applyHistoricalFairValue`) |
| Price-drop alerts | `src/lib/commerce/price-alerts.ts` (pure logic), `src/lib/email/price-drop-alert.ts` (template), `src/lib/email/send.ts` (Resend wrapper), `src/app/api/cron/snapshot-prices/route.ts` |
| Discover infinite-scroll browse rows | `src/lib/recommendations/browse-rows.ts`, `src/components/discover/browse-row.tsx`, `src/hooks/use-in-view.ts` |
| Enrichment caching (in-memory + DB) | `src/lib/utils/ttl-cache.ts`, `src/lib/recommendations/enrich.ts`, `src/app/api/discogs/enrich/route.ts` |
| Metrics dashboard | `src/app/(app)/dashboard/page.tsx`, `src/lib/admin.ts`, `src/components/dashboard/` |
| Spotify playlist import | `src/lib/spotify/client.ts` (`fetchPlaylistLibrary`), `src/lib/auth.ts` (scope tracking), `src/types/next-auth.d.ts` |
| Profile page | `src/app/(app)/profile/page.tsx` |
| Quiz redesign (experience level, Spotify-tailored questions) | `src/components/quiz/quiz-flow.tsx`, `src/lib/quiz/spotify-pool.ts`, `src/lib/quiz/recognized-artists.ts`, `src/lib/quiz/album-battles.ts` |

## API routes

| Route | Notes |
|-------|-------|
| `GET/POST /api/quiz` | Save taste profile + quiz responses |
| `GET/POST /api/spotify/top` | Sync listening snapshot (POST = force) |
| `GET/POST /api/recommendations` | Load/regenerate picks (`maxDuration: 90`) |
| `POST /api/feedback` | Recommendation signals; clears cache |
| `GET/POST/DELETE /api/wishlist` | Auth required; `POST` now also captures `priceAtAdd` |
| `POST /api/reservations` | Spend credits on listing hold; response now includes a fresh `reservationCount` and `cap` for that release; 409 once the reservation cap is reached |
| `GET /api/discogs/search` | Full-catalog vinyl search, guest-accessible, no auth (`maxDuration: 15`). No longer enriches — returns the raw list only (see "Discover/Search loading performance") |
| `POST /api/discogs/enrich` | New — enriches a client-supplied batch of items with price/rating/fair-value (`maxDuration: 30`); called as a background follow-up to the search route above |
| `GET /api/discogs/release`, `/marketplace` | Release, marketplace proxies |
| `GET /api/cron/snapshot-prices` | Vercel Cron only — `Authorization: Bearer $CRON_SECRET` (`maxDuration: 120`) |
| `POST /api/analytics/event` | Client-side analytics beacon; only accepts `CLIENT_LOGGABLE_EVENT_TYPES` (currently just `search_result_click`) |

## Environment

Copy `.env.example` → `.env.local`. Required for full functionality:

- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `AUTH_SECRET`
- `DISCOGS_TOKEN`
- `DATABASE_URL` (defaults to local SQLite file)

Optional: `LASTFM_API_KEY` (similar-artist discovery), `TURSO_*` (persistent prod DB), `CRON_SECRET` (required for `/api/cron/snapshot-prices` to accept requests — see "Price history & deals"), `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (price-drop alert emails; omitted = cron still snapshots prices, just skips sending), `SERPAPI_KEY` (Google Shopping meta-search for the album "Where to buy" panel; omitted = panel shows the Discogs offer only), `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` (eBay Browse API offer source; omitted = source skipped), `EBAY_CAMPAIGN_ID` (eBay Partner Network affiliate tagging; only meaningful with the eBay creds above), `SKIMLINKS_PUBLISHER_ID` (affiliate-tags Google Shopping / local-shop offer links via Skimlinks; omitted = those links stay direct, no affiliate disclosure shown) — see "eBay + affiliate tagging + local-shop sources". `ADMIN_EMAIL` (gates `/dashboard` to the one signed-in email that matches — see "Internal metrics dashboard"; unset means the dashboard 404s for everyone, including the owner — **not yet set in the Vercel production env**).

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
| **ML / embeddings** | Still rule-based heuristic scoring; no learned weights |
| **Cross-browser-engine testing** | UI/mobile verification in this repo has been done via the Chromium-based preview tooling only (viewport resizing for mobile/tablet); Firefox/Safari rendering has not been separately verified |
| **Verified email sending domain** | Price-drop alerts work end-to-end locally, but Resend (like any transactional email provider) requires a verified sending domain before it can email real users — currently only the developer's own Resend-verified address can receive mail |
| **`ADMIN_EMAIL` not set in production** | `/dashboard` is built and deployed but 404s for everyone until this is set in Vercel's project env vars — see "Internal metrics dashboard" |
| **Real Spotify-connected verification** | A recurring, compounding gap: no Spotify OAuth session has been available in this environment across many sessions of work now. Playlist import's actual scope-grant flow, the taste-vector weight rebalance, quiz round-out's scoring effect, and the dashboard's authenticated view are all unit-tested/code-reviewed but not observed end-to-end on a real connected account. Worth a dedicated pass logging in with a real account and just looking at what changed. |
| **Non-Spotify account creation** | Considered and deliberately not built when scoping the profile page — guest data already persists via the cookie-to-account merge on Spotify sign-in, so this would only matter for someone who wants a persistent account *without* connecting Spotify. Not clearly worth the added auth-method complexity unless that turns out to be a real ask. |

## Recommended next steps

North star: best vinyl-searching site + best deals on vinyl. Roughly in priority order:

1. ~~**Full-catalog search**~~ — done, see "Catalog search" above.
2. ~~**Real price-history fair value + price-drop email alerts**~~ — done, see "Price history & deals" above. Two follow-ups worth doing before this compounds much further: verify a sending domain with Resend (real user emails don't work without it), and deploy to Vercel with `CRON_SECRET` set so the daily snapshot job actually starts running.
3. ~~**Instrument the success metrics that already exist on paper**~~ — done, see "Success-metrics instrumentation" above. Next natural step here (not started): a real dashboard/route surfacing these instead of script-only access, once there's enough data accumulated for the numbers to be meaningful.
4. ~~**Round out the quiz**~~ — done, see "Reservation scarcity cap + rounding out the quiz" above.
5. ~~**Decide reservation scarcity's teeth**~~ — done (capped at `min(numForSale, 5)`), see "Reservation scarcity cap + rounding out the quiz" above.
6. ~~**Playlist import**~~ — done, see "Internal metrics dashboard + Spotify playlist import" above.
7. ~~**Metrics dashboard UI**~~ — done, see same section above. **Needs `ADMIN_EMAIL` set in Vercel to actually be reachable in production.**
8. ~~**Discover/Search felt limited**~~ — done, see "Netflix-style infinite scroll for Discover + Search" and "Discover/Search loading performance" above.
9. **A real Spotify-connected verification pass** — the single highest-value next step isn't a new feature, it's confirming the last several sessions' worth of Spotify-path work (weight rebalance, quiz round-out scoring, playlist import, dashboard) actually behaves as intended on a real connected account. See the new Deferred entry.
10. **ML/embeddings and cross-browser QA** are lower priority right now: the heuristic scoring is legible and debuggable (a real advantage while the product is still finding its shape), and the app is Chromium-verified with no reported cross-engine issues — revisit both once the metrics dashboard accumulates enough real data to show the heuristic approach actually plateauing.

## Known constraints

- **Spotify rate limits** — sync batches parallel fetches; 24h snapshot TTL; 1h recommendation cache
- **Discogs rate limit** — global 1 req/sec throttle (`discogsThrottle`); any new per-item enrichment (e.g. compare-pressings pricing) must be designed around this — see why `getMasterVersions()` deliberately skips per-version price fetches, and why the price-snapshot cron caps itself at 100 releases/run
- **Discogs is slow** — scoring does up to 35 vinyl lookups (Spotify path) or up to 40 enrichment calls (quiz-only path); generation is client-triggered to avoid serverless timeouts, `maxDuration: 90` on `/api/recommendations`
- **Guest wishlist** — requires sign-in; quiz and recommendations work for guests
- **Quiz-only path** — no longer purely positional (`50 - index`): now gets weighted-sample browse variety, mood/format/deep-cut/reissue fit, artist-recognition affinity, and feedback signals like the Spotify path does, but still lacks the richer Spotify-derived taste-vector signals (artist/album affinity, recent rotation, Last.fm similarity)
- **Real fair value only covers wishlisted releases** — see "Price history & deals" above; everything else still gets the batch-relative badge
- **Local SQLite under concurrency** — the local file (both `record_finder.db` and the vitest throwaway db) now sets `PRAGMA busy_timeout` on connect so concurrent writers wait instead of throwing `SQLITE_BUSY` (see "Polish & hardening pass" above); WAL mode was deliberately not also enabled, since the mode switch itself needs a brief exclusive lock and caused the exact startup race it would be meant to fix
- **`/search` is public with no abuse protection** — the route is guest-accessible by design, but nothing beyond the shared `discogsThrottle` limits one client from monopolizing the app's whole Discogs request budget (quiz-gating incidentally did this for Discover before). See "Catalog search" above.
- **Price-drop emails need a verified sending domain** — see "Price history & deals" above and the new Deferred entry.
- **Search filter clicks abort client-side but not server-side** — `SearchFeed`'s `AbortController` (see "Search filters" above) stops a stale response from clobbering the UI, but the aborted request's Discogs calls already in flight on the server keep running to completion regardless. Rapid-fire filter changes still cost real Discogs quota per click; a debounce on filter changes (not just the abort) would be the next step if this becomes a real problem.
- **Discover/Search enrichment cache is partially in-memory** — the fast tier (`ttl-cache.ts`) resets on a serverless cold start and isn't shared across concurrent instances, so production won't see the same hit rate a warm local session does. The DB-backed tier (`release_enrichment_cache`) covers this gap but adds a DB round trip per lookup — see "Discover/Search loading performance."
- **Discover's browse rows are catalog-relevance, not taste-vector-scored** — only the first couple of rows (Top Picks, up to 2 genre rows) are scored against the user's taste vector; everything reached by scrolling further is a live Discogs query (genre/decade/most-wanted), so titles can repeat across rows. Intentional (Netflix does the same), documented in "Netflix-style infinite scroll" above.

## Success metrics (from roadmap — instrumented 2026-07-09, dashboard shipped 2026-07-13)

See "Success-metrics instrumentation" and "Internal metrics dashboard" above. Viewable at `/dashboard` once `ADMIN_EMAIL` is set (not yet done in production); also still directly callable from a script/REPL:

- `getReasonCitationRate()` — % of recommendations with specific reasons citing saved/recent/core taste
- `getFeedbackLikeRateBySource()` — feedback `like` rate: Spotify-connected vs quiz-only
- `getSyncToFirstRecommendationStats()` — time-to-first-recommendation after connect (sync *completion rate* deliberately not computed — see caveat above)
- `getSearchToReservationFunnel()` — search → click-through → reservation
- `getEmailToReservationFunnel()` — price-drop email click → reservation
