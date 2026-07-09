import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const tasteProfile = sqliteTable("taste_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  genres: text("genres").notNull().default("[]"),
  decades: text("decades").notNull().default("[]"),
  moods: text("moods").notNull().default("[]"),
  albumPreference: text("album_preference").notNull().default("balanced"),
  formatPreference: text("format_preference").notNull().default("either"),
  deepCutLevel: integer("deep_cut_level").notNull().default(50),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  userIdx: uniqueIndex("taste_profile_user_idx").on(t.userId),
}));

export const spotifySnapshot = sqliteTable("spotify_snapshot", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  topArtists: text("top_artists").notNull().default("[]"),
  topAlbums: text("top_albums").notNull().default("[]"),
  topGenres: text("top_genres").notNull().default("[]"),
  topArtistsByTerm: text("top_artists_by_term").notNull().default("{}"),
  topTracksByTerm: text("top_tracks_by_term").notNull().default("{}"),
  savedAlbums: text("saved_albums").notNull().default("[]"),
  savedTracks: text("saved_tracks").notNull().default("[]"),
  recentlyPlayed: text("recently_played").notNull().default("[]"),
  tasteVector: text("taste_vector").notNull().default("{}"),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  userIdx: uniqueIndex("spotify_snapshot_user_idx").on(t.userId),
}));

export const quizResponses = sqliteTable("quiz_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  albumPreferences: text("album_preferences").notNull().default("[]"),
  subGenres: text("sub_genres").notNull().default("{}"),
  recognizedArtists: text("recognized_artists").notNull().default('{"owned":[],"seenLive":[]}'),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  userIdx: uniqueIndex("quiz_responses_user_idx").on(t.userId),
}));

export const wishlistItems = sqliteTable("wishlist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  discogsReleaseId: integer("discogs_release_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  coverUrl: text("cover_url"),
  year: integer("year"),
  notes: text("notes").default(""),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
  // Captured once at add-time; compared against price_history to power the
  // "price dropped" badge and email alerts. Null for items added before this
  // column existed, or if the Discogs marketplace call failed at add-time.
  priceAtAdd: real("price_at_add"),
  // The price we last emailed the user about — only a *further* drop below
  // this triggers another alert, so a price that stays low isn't re-alerted
  // every day. Null until the first alert is sent.
  lastAlertedPrice: real("last_alerted_price"),
}, (t) => ({
  userReleaseIdx: uniqueIndex("wishlist_user_release_idx").on(t.userId, t.discogsReleaseId),
}));

// Daily price snapshots for wishlisted releases (deduped across users — see
// getReleaseIdsNeedingSnapshot), powering real (non-batch-relative) fair-value
// and wishlist price-drop alerts. Populated by the /api/cron/snapshot-prices
// job and an immediate snapshot on wishlist add.
export const priceHistory = sqliteTable("price_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  discogsReleaseId: integer("discogs_release_id").notNull(),
  lowestPrice: real("lowest_price"),
  currency: text("currency").notNull().default("USD"),
  numForSale: integer("num_for_sale").notNull().default(0),
  snapshotAt: integer("snapshot_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  releaseIdx: index("price_history_release_idx").on(t.discogsReleaseId, t.snapshotAt),
}));

export const recommendationCache = sqliteTable("recommendation_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  results: text("results").notNull().default("[]"),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  userIdx: uniqueIndex("recommendation_cache_user_idx").on(t.userId),
}));

export const recommendationFeedback = sqliteTable("recommendation_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  discogsReleaseId: integer("discogs_release_id").notNull(),
  artist: text("artist").notNull().default(""),
  // One of: like | dislike | own | hide
  signal: text("signal").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  userReleaseIdx: uniqueIndex("feedback_user_release_idx").on(t.userId, t.discogsReleaseId),
  userIdx: index("feedback_user_idx").on(t.userId),
}));

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const creditLedger = sqliteTable("credit_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// A "reservation": credits spent to hold a concierge queue spot for a Discogs
// listing. There is no payment lifecycle — the buyer completes the purchase
// on Discogs themselves, so this table has no status/lifecycle field.
export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  discogsReleaseId: integer("discogs_release_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  creditsSpent: integer("credits_spent").notNull(),
  discogsUrl: text("discogs_url").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Local/independent record stores that have opted their Shopify storefront
// into the "where to buy" offer panel — the seed of the local-shop flywheel.
// No public self-serve claim/verification flow yet (see offers/shopify.ts);
// rows are added by hand for now via addLocalShop().
export const localShops = sqliteTable("local_shops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  // Storefront domain that exposes Shopify's public /products.json (a
  // *.myshopify.com domain or a custom domain still proxying to Shopify).
  domain: text("domain").notNull(),
  city: text("city"),
  region: text("region"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  domainIdx: uniqueIndex("local_shops_domain_idx").on(t.domain),
}));

// Shared, DB-backed cache for the "where to buy" offer panel (mirrors
// recommendation_cache) — replaces the earlier in-memory Map, which was lost
// on every serverless cold start and not shared across instances. One row per
// release; `offers`/`sources` are JSON (see offers/orchestrator.ts's
// OfferResult).
export const offerCache = sqliteTable("offer_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  discogsReleaseId: integer("discogs_release_id").notNull(),
  offers: text("offers").notNull().default("[]"),
  sources: text("sources").notNull().default("[]"),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  releaseIdx: uniqueIndex("offer_cache_release_idx").on(t.discogsReleaseId),
}));

// Raw success-metrics event log (recommendation generation, feedback, sync,
// search, reservations, email clicks) — see lib/db/queries.ts's `logEvent()`
// and lib/analytics/metrics.ts for the pure aggregation functions that turn
// these rows into the success metrics from the roadmap. Intentionally a flat
// event log rather than per-metric counter tables, since which metrics matter
// is still evolving.
export const analyticsEvents = sqliteTable("analytics_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  typeIdx: index("analytics_events_type_idx").on(t.type),
  userIdx: index("analytics_events_user_idx").on(t.userId),
}));
