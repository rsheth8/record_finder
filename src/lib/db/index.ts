import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import * as schema from "../../../drizzle/schema";

function getDbUrl(): string {
  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL;
  }
  if (process.env.DATABASE_URL?.startsWith("file:")) {
    return process.env.DATABASE_URL;
  }
  if (process.env.VERCEL) {
    return `file:${join(tmpdir(), "record_finder.db")}`;
  }
  return `file:${join(process.cwd(), "data", "record_finder.db")}`;
}

const dbUrl = getDbUrl();

if (dbUrl.startsWith("file:") && !process.env.VERCEL) {
  const filePath = dbUrl.replace("file:", "");
  mkdirSync(dirname(filePath), { recursive: true });
}

const client: Client = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db: LibSQLDatabase<typeof schema> = drizzle(client, { schema });

const INIT_SQL = `
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
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    stripe_session_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    discogs_release_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    credits_spent INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved',
    discogs_url TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

let initPromise: Promise<void> | null = null;

export function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = client.executeMultiple(INIT_SQL).then(() => undefined);
  }
  return initPromise;
}

export async function ensureDb() {
  await initDb();
}
