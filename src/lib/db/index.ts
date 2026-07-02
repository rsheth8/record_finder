import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { mkdirSync } from "fs";
import { join } from "path";
import * as schema from "../../../drizzle/schema";

const isDeployed = Boolean(process.env.VERCEL);
const MIGRATIONS_TABLE = "__drizzle_migrations";

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

function migrationErrorText(error: unknown): string {
  const parts = [error instanceof Error ? error.message : String(error)];
  if (error && typeof error === "object" && "cause" in error) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error) parts.push(cause.message);
    else if (cause) parts.push(String(cause));
  }
  return parts.join(" ");
}

function isIgnorableMigrationError(error: unknown): boolean {
  const msg = migrationErrorText(error).toLowerCase();
  return (
    msg.includes("already exists") ||
    msg.includes("duplicate column") ||
    msg.includes("duplicate column name") ||
    msg.includes("no such index") ||
    msg.includes("no such column")
  );
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => {
    const name = row.name ?? row[1];
    return name === column;
  });
}

async function tableRowCount(table: string): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
  const row = result.rows[0];
  const count = row?.count ?? row?.[0];
  return Number(count ?? 0);
}

async function isMigrationRecorded(hash: string): Promise<boolean> {
  const result = await client.execute({
    sql: `SELECT 1 FROM ${MIGRATIONS_TABLE} WHERE hash = ? LIMIT 1`,
    args: [hash],
  });
  return result.rows.length > 0;
}

async function runMigrationStatement(statement: string) {
  const stmt = statement.trim();
  if (!stmt) return;

  const addUserId = stmt.match(/^ALTER TABLE `(\w+)` ADD `user_id` text NOT NULL;$/);
  if (addUserId) {
    const table = addUserId[1];
    if (await columnExists(table, "user_id")) return;

    if ((await tableRowCount(table)) > 0) {
      await client.execute(`ALTER TABLE \`${table}\` ADD \`user_id\` text`);
      await client.execute(
        `UPDATE \`${table}\` SET user_id = 'legacy' WHERE user_id IS NULL`,
      );
      return;
    }
  }

  try {
    await client.execute(stmt);
  } catch (error) {
    if (!isIgnorableMigrationError(error)) throw error;
  }
}

/** When tables exist but __drizzle_migrations is empty (e.g. after db:push),
 * drizzle's migrator retries from 0000 and fails. Apply each migration statement
 * idempotently, then record the journal entry. */
async function applyMigrationsTolerant(migrationsFolder: string) {
  await client.execute(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash text NOT NULL,
    created_at numeric
  )`);

  const migrations = readMigrationFiles({ migrationsFolder });
  for (const migration of migrations) {
    if (await isMigrationRecorded(migration.hash)) continue;

    for (const statement of migration.sql) {
      await runMigrationStatement(statement);
    }

    await client.execute({
      sql: `INSERT INTO ${MIGRATIONS_TABLE} ("hash", "created_at") VALUES (?, ?)`,
      args: [migration.hash, migration.folderMillis],
    });
  }
}

export function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const migrationsFolder = join(process.cwd(), "drizzle", "migrations");
      try {
        await migrate(db, { migrationsFolder });
      } catch (error) {
        if (!isIgnorableMigrationError(error)) {
          console.warn("[db] migrate() failed; running tolerant repair:", migrationErrorText(error));
        }
        await applyMigrationsTolerant(migrationsFolder);
      }
    })();
  }
  return initPromise;
}

export async function ensureDb() {
  await initDb();
}
