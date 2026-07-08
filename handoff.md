# Record Finder — Handoff

Last updated: 2026-07-08

## What this is

**Record Finder** is a Next.js vinyl discovery app. Users take a taste quiz (no account required), optionally connect Spotify, and get Discogs-backed album recommendations scored to their listening history and preferences. Album pages show pressing details (including matrix/runout and mastering credits), a cross-pressing comparison, marketplace pricing, a fair-value signal, wishlist, feedback, and a credits-based reservation flow for concierge queue spots with a lightweight scarcity indicator.

**North star for recommendations:** picks that feel like a friend who knows your taste — not generic genre browsing. **North star for differentiation:** build things on the Spotify-listening ↔ Discogs-vinyl bridge that a plain marketplace (Discogs) or a blind curated subscription (VMP-style) structurally can't offer — see "Vinyl-native differentiation features" below.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19 |
| UI / motion | Tailwind CSS v4, hand-rolled primitives (no UI lib); `gsap` + `framer-motion` for motion; **no 3D libs** (a WebGL scene was removed — see below) |
| Auth | NextAuth v5 — Spotify OAuth only |
| DB | SQLite via Drizzle + libSQL / `@libsql/client` (`file:./data/record_finder.db` locally; Turso optional in prod) |
| APIs | Discogs (vinyl source of truth), Spotify, Last.fm, MusicBrainz, Apple Music (iTunes Search) |
| Tests | Vitest |

## User flows

```
Home → Taste Quiz (7 steps) → Discover → Album detail
         ↓ optional
    Spotify connect → full listening sync → sharper picks
```

1. **Quiz** (`/quiz`) — genres, sub-genres, decades, moods, album A-vs-B battles, listening style, deep-cut slider. Guests get a signed cookie ID; data persists without sign-in.
2. **Spotify connect** — OAuth scopes: `user-top-read`, `user-read-recently-played`, `user-library-read`. Sync runs on home page connect and before recommendation generation when snapshot is stale (24h).
3. **Discover** (`/discover`) — requires completed quiz. Reads recommendation cache on SSR; client triggers `POST /api/recommendations` if empty (~25s Discogs pass).
4. **Album** (`/album/[id]`) — Discogs release detail, feedback (like/dislike/own/hide), wishlist (signed-in), reserve with credits, Spotify link.
5. **Wishlist** (`/wishlist`) — requires Spotify sign-in.

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

## Polish & hardening pass (2026-07-08)

Full manual walkthrough of every user flow (quiz retake, discover rows/grid/filters/search, album detail, feedback, guest gating on wishlist/reservation, theming, mobile) plus targeted new test coverage. Found and fixed three real bugs, none of which were caught by the existing test suite because the affected code paths had no tests:

- **Album pages showed "Unknown" as the artist** for any release whose Discogs `title` field didn't happen to be formatted `"Artist - Title"` (most don't — that convention only reliably holds for `/database/search` results, not `/releases/{id}`). `getRelease()` (`src/lib/discogs/client.ts`) now reads the artist from the response's own `artists` array instead of splitting the title, honoring each artist's `join` separator and stripping Discogs' `(2)`-style disambiguation suffix.
- **Duplicate discover rows for the same genre** (e.g. both "Hip-Hop" and "Hip Hop") — quiz genre labels use hyphens, raw Discogs genre strings use spaces, and the row-building dedup in `groupRecommendations()` (`src/lib/recommendations/group.ts`) compared them as exact strings. Now normalized through the existing `normalize()` helper (`src/lib/recommendations/match.ts`) before comparing.
- **Flaky `SQLITE_BUSY` test failures** — the local SQLite file had no `busy_timeout`, so concurrent connections (multiple vitest forked test files, or concurrent dev-server requests) could fail immediately instead of waiting for the lock. Fixed once in `src/lib/db/index.ts` rather than in test setup, since the same race is latent in local dev under concurrent requests too.

Added tests for previously-uncovered pure logic: `group.ts` (including a regression test for the genre-dedup bug above), `normalize.ts` (legacy-cache coercion), and `commerce/pricing.ts`, `commerce/currency.ts`, `commerce/credits-service.ts`. Suite went from 113 to 143 tests, all green across repeated runs.

**Still not covered by tests:** `scoreCandidates()` / `getQuizOnlyRecommendations()` in `engine.ts` (would need mocking Discogs/MusicBrainz/Last.fm/Apple Music clients — meaningful effort for a payoff not yet weighed against just re-reading the code), and anything requiring a real Spotify OAuth session (listening-intent row, wishlist, the Spotify-seeded recommendation path) — manual verification here was guest-mode only.

## Database schema

Schema: `drizzle/schema.ts`. Latest migration: `drizzle/migrations/0004_taste_intelligence.sql`.

| Table | Purpose |
|-------|---------|
| `taste_profile` | Quiz summary (genres, decades, moods, album preference, deep-cut level) |
| `quiz_responses` | Sub-genres + album battle preferences |
| `spotify_snapshot` | Full listening snapshot + derived `taste_vector` |
| `recommendation_cache` | Scored `Recommendation[]`, 1h expiry |
| `recommendation_feedback` | like / dislike / own / hide per release |
| `wishlist_items` | Saved vinyl releases |
| `users`, `credit_ledger`, `orders` | Auth + credits + reservations |

Queries: `src/lib/db/queries.ts`. Migrations run on app startup via `src/lib/db/index.ts`.

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

## API routes

| Route | Notes |
|-------|-------|
| `GET/POST /api/quiz` | Save taste profile + quiz responses |
| `GET/POST /api/spotify/top` | Sync listening snapshot (POST = force) |
| `GET/POST /api/recommendations` | Load/regenerate picks (`maxDuration: 60`) |
| `POST /api/feedback` | Recommendation signals; clears cache |
| `GET/POST/DELETE /api/wishlist` | Auth required |
| `POST /api/reservations` | Spend credits on listing hold; response now includes a fresh `reservationCount` for that release |
| `GET /api/discogs/*` | Release, search, marketplace proxies |

## Environment

Copy `.env.example` → `.env.local`. Required for full functionality:

- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `AUTH_SECRET`
- `DISCOGS_TOKEN`
- `DATABASE_URL` (defaults to local SQLite file)

Optional: `LASTFM_API_KEY` (similar-artist discovery), `TURSO_*` (persistent prod DB).

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
| **True price-history / market fair value** | Current fair-value badge is batch-relative only (see above); a real "underpriced vs. historical market" signal needs a new `price_history` table + periodic snapshotting — **no cron/scheduled-job infrastructure exists in this repo** (no `vercel.json`, no GitHub Actions, no scheduled route handlers), so this needs an infra decision first |
| **Hard-capped reservations** | Reservation scarcity currently only shows a count ("N collectors reserved a spot"); there's no cap and a reservation never blocks. If real scarcity is wanted, decide between a flat per-release constant or `min(numForSale, X)` before implementing |
| **Cross-browser-engine testing** | UI/mobile verification in this repo has been done via the Chromium-based preview tooling only (viewport resizing for mobile/tablet); Firefox/Safari rendering has not been separately verified |

## Recommended next steps

Roughly in priority order, reasoning about leverage vs. effort:

1. **Instrument the success metrics that already exist on paper** (see "Success metrics" below). Every other decision about the recommendation engine — whether the finalize-score weights are right, whether quiz-only users need more signal, whether fair-value actually gets clicked — is a guess without like-rate and reason-citation data. This is mostly plumbing (log an event on feedback/reservation/wishlist actions to a new lightweight table) and unblocks everything downstream. Do this before investing further in scoring tweaks.
2. **True price-history fair value.** This is the flagship "structurally can't be copied by a plain marketplace" feature per the north star, and the current batch-relative version is a placeholder. Needs an infra decision first (Vercel cron vs. GitHub Actions scheduled workflow vs. a manually-triggered route) plus a `price_history` table and a daily snapshot job sampling marketplace price/want/have per release. Worth scoping the infra decision even before the data model.
3. **Round out the quiz** with the two deferred steps (artist recognition grid, vinyl format preference) — cheap, additive, and both directly feed scoring signals that already exist in the engine (format preference already exists as a *result* filter in discover; it's not yet a quiz *input*).
4. **Decide reservation scarcity's teeth.** Right now it's a count with no cap — fine as a nudge, but if the product goal is real urgency, decide between a flat per-release constant or `min(numForSale, X)` and implement the cap. Low effort, but a product decision, not just an engineering one.
5. **Playlist import** — highest user-visible payoff of the deferred Spotify-scope work, but forces a re-auth for existing connected users, so bundle it with another scope-touching change rather than shipping alone.
6. **ML/embeddings and cross-browser QA** are lower priority right now: the heuristic scoring is legible and debuggable (a real advantage while the product is still finding its shape), and the app is Chromium-verified with no reported cross-engine issues — revisit both once the metrics in (1) show the heuristic approach actually plateauing.

## Known constraints

- **Spotify rate limits** — sync batches parallel fetches; 24h snapshot TTL; 1h recommendation cache
- **Discogs rate limit** — global 1 req/sec throttle (`discogsThrottle`); any new per-item enrichment (e.g. compare-pressings pricing) must be designed around this — see why `getMasterVersions()` deliberately skips per-version price fetches
- **Discogs is slow** — scoring does up to 25 vinyl lookups; generation is client-triggered to avoid serverless timeouts
- **Guest wishlist** — requires sign-in; quiz and recommendations work for guests
- **Quiz-only path** — no longer purely positional (`50 - index`): now gets weighted-sample browse variety, mood/format/deep-cut fit, and feedback signals like the Spotify path does, but still lacks the richer Spotify-derived taste-vector signals (artist/album affinity, recent rotation, Last.fm similarity)
- **Fair value is relative, not historical** — see "True price-history / market fair value" above
- **Local SQLite under concurrency** — the local file (both `record_finder.db` and the vitest throwaway db) now sets `PRAGMA busy_timeout` on connect so concurrent writers wait instead of throwing `SQLITE_BUSY` (see "Polish & hardening pass" above); WAL mode was deliberately not also enabled, since the mode switch itself needs a brief exclusive lock and caused the exact startup race it would be meant to fix

## Success metrics (from roadmap — not instrumented yet)

- % of recommendations with specific reasons citing saved/recent/core taste
- Feedback `like` rate: Spotify-connected vs quiz-only
- Sync completion rate and time-to-first-recommendation after connect
