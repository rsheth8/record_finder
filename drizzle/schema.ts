import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const tasteProfile = sqliteTable("taste_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  genres: text("genres").notNull().default("[]"),
  decades: text("decades").notNull().default("[]"),
  moods: text("moods").notNull().default("[]"),
  albumPreference: text("album_preference").notNull().default("balanced"),
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
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  userIdx: uniqueIndex("spotify_snapshot_user_idx").on(t.userId),
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
}, (t) => ({
  userReleaseIdx: uniqueIndex("wishlist_user_release_idx").on(t.userId, t.discogsReleaseId),
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
