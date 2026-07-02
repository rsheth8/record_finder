import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync } from "fs";
import { join } from "path";
import * as schema from "../../../drizzle/schema";

const isDeployed = Boolean(process.env.VERCEL);

function getDbUrl(): string {
  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL;
  }
  if (isDeployed) {
    throw new Error(
      "TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN) must be set in production — refusing to fall back to " +
        "ephemeral local storage, which would silently lose credits/wishlist/taste-profile data on every redeploy.",
    );
  }
  if (process.env.DATABASE_URL?.startsWith("file:")) {
    return process.env.DATABASE_URL;
  }
  return `file:${join(process.cwd(), "data", "record_finder.db")}`;
}

const dbUrl = getDbUrl();

if (dbUrl.startsWith("file:")) {
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
}

const client: Client = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db: LibSQLDatabase<typeof schema> = drizzle(client, { schema });

let initPromise: Promise<void> | null = null;

export function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = migrate(db, { migrationsFolder: join(process.cwd(), "drizzle", "migrations") });
  }
  return initPromise;
}

export async function ensureDb() {
  await initDb();
}
