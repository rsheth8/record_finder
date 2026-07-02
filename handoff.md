# Record Finder — Handoff

Last updated: July 2026

## What this is

**Record Finder** is a Next.js vinyl discovery app. Users take a taste quiz (no account required), optionally connect Spotify, and get Discogs-backed album recommendations scored to their listening history and preferences. Album pages show pressing details, marketplace pricing, wishlist, feedback, and a credits-based reservation flow for concierge queue spots.

**North star for recommendations:** picks that feel like a friend who knows your taste — not generic genre browsing.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19 |
| Auth | NextAuth v5 — Spotify OAuth only |
| DB | SQLite via Drizzle + libSQL (`file:./data/record_finder.db` locally; Turso optional in prod) |
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

### Algorithm (Phase 2)

**Pipeline** (`src/lib/recommendations/load.ts`):

1. Gate on completed quiz
2. Return cache if fresh (1h TTL) unless refresh requested
3. If Spotify connected + stale snapshot → full sync
4. Seed candidates from saved-album artists, trending artists, core artists, Last.fm similar artists, taste-vector genres
5. Score via `scoreCandidates()` in `engine.ts`
6. Exclude own/hide feedback; skip wishlisted releases from discover
7. Enrich with Discogs marketplace data; cache

**Scoring highlights** (`src/lib/recommendations/engine.ts`):

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

**Explainability** — `buildReasons()` cites saved albums, recent rotation, core-artist deep cuts, library similarity, quiz genre/mood matches.

**Fallback** — no Spotify or API failure → `getQuizOnlyRecommendations()` (Discogs browse by genre/decade).

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
| Discogs matching | `src/lib/recommendations/match.ts` |
| Discover UI grouping/filtering | `src/lib/recommendations/group.ts`, `filter.ts` |
| Spotify fetch + discovery seeds | `src/lib/spotify/client.ts` |
| Spotify sync | `src/lib/spotify/sync.ts` |
| Taste vector derivation | `src/lib/taste/derive-profile.ts` |
| Types | `src/lib/types.ts` |
| Auth + guest merge | `src/lib/auth.ts`, `src/lib/identity.ts` |
| Commerce | `src/lib/commerce/` |

## API routes

| Route | Notes |
|-------|-------|
| `GET/POST /api/quiz` | Save taste profile + quiz responses |
| `GET/POST /api/spotify/top` | Sync listening snapshot (POST = force) |
| `GET/POST /api/recommendations` | Load/regenerate picks (`maxDuration: 60`) |
| `POST /api/feedback` | Recommendation signals; clears cache |
| `GET/POST/DELETE /api/wishlist` | Auth required |
| `POST /api/reservations` | Spend credits on listing hold |
| `GET /api/discogs/*` | Release, search, marketplace proxies |

## Environment

Copy `.env.example` → `.env.local`. Required for full functionality:

- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `AUTH_SECRET`
- `DISCOGS_TOKEN`
- `DATABASE_URL` (defaults to local SQLite file)

Optional: `LASTFM_API_KEY` (similar-artist discovery), `TURSO_*` (persistent prod DB).

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

## Known constraints

- **Spotify rate limits** — sync batches parallel fetches; 24h snapshot TTL; 1h recommendation cache
- **Discogs is slow** — scoring does up to 25 vinyl lookups; generation is client-triggered to avoid serverless timeouts
- **Guest wishlist** — requires sign-in; quiz and recommendations work for guests
- **Quiz-only path** — weaker than Spotify-connected scoring (positional `50 - index` on Discogs browse)

## Success metrics (from roadmap — not instrumented yet)

- % of recommendations with specific reasons citing saved/recent/core taste
- Feedback `like` rate: Spotify-connected vs quiz-only
- Sync completion rate and time-to-first-recommendation after connect
