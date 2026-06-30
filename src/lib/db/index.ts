import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import * as schema from "../../../drizzle/schema";

const dbPath =
  process.env.DATABASE_URL?.replace("file:", "") ??
  join(process.cwd(), "data", "record_finder.db");

mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS taste_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      genres TEXT NOT NULL DEFAULT '[]',
      decades TEXT NOT NULL DEFAULT '[]',
      moods TEXT NOT NULL DEFAULT '[]',
      album_preference TEXT NOT NULL DEFAULT 'balanced',
      deep_cut_level INTEGER NOT NULL DEFAULT 50,
      completed_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS spotify_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      top_artists TEXT NOT NULL DEFAULT '[]',
      top_albums TEXT NOT NULL DEFAULT '[]',
      top_genres TEXT NOT NULL DEFAULT '[]',
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discogs_release_id INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      cover_url TEXT,
      year INTEGER,
      notes TEXT DEFAULT '',
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recommendation_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      results TEXT NOT NULL DEFAULT '[]',
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}

initDb();
