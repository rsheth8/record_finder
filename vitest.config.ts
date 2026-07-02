import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Child processes (not worker threads) so the native SQLite driver loads cleanly.
    pool: "forks",
    env: {
      AUTH_SECRET: "test-secret",
      // DB-backed tests run against a throwaway SQLite file under ./data
      // (already gitignored and auto-created by src/lib/db/index.ts).
      DATABASE_URL: "file:./data/vitest-test.db",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
