import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const tasteProfile = sqliteTable("taste_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  genres: text("genres").notNull().default("[]"),
  decades: text("decades").notNull().default("[]"),
  moods: text("moods").notNull().default("[]"),
  albumPreference: text("album_preference").notNull().default("balanced"),
  deepCutLevel: integer("deep_cut_level").notNull().default(50),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const spotifySnapshot = sqliteTable("spotify_snapshot", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topArtists: text("top_artists").notNull().default("[]"),
  topAlbums: text("top_albums").notNull().default("[]"),
  topGenres: text("top_genres").notNull().default("[]"),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
});

export const wishlistItems = sqliteTable("wishlist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  discogsReleaseId: integer("discogs_release_id").notNull().unique(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  coverUrl: text("cover_url"),
  year: integer("year"),
  notes: text("notes").default(""),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
});

export const recommendationCache = sqliteTable("recommendation_cache", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  results: text("results").notNull().default("[]"),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

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
  stripeSessionId: text("stripe_session_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  discogsReleaseId: integer("discogs_release_id").notNull(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  creditsSpent: integer("credits_spent").notNull(),
  status: text("status").notNull().default("reserved"),
  discogsUrl: text("discogs_url").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
