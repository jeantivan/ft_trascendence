import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl } from "./tests/support/test-database-url";

// Test database (#83): with DATABASE_URL_TEST every test runs, and DATABASE_URL is
// replaced by it so Prisma and the realtime listener use the test database too.
// Without it the *.db.test.ts files are skipped, so npm test works without Postgres.
const testDatabaseUrl = resolveTestDatabaseUrl(process.env);
if (testDatabaseUrl === null) {
  // Without this line the skipped files would vanish from the summary unnoticed
  console.warn("Skipping *.db.test.ts: DATABASE_URL_TEST is not set. Run make test to include them.");
}

// Files that need the real Node realm (undici FormData parsing fails inside a vm context)
const vmIncompatible = ["tests/unit/uploads/upload-route.test.ts"];
const baseExclude = testDatabaseUrl === null ? [...configDefaults.exclude, "**/*.db.test.ts"] : configDefaults.exclude;

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    setupFiles: ["./vitest.setup.ts"],
    env: testDatabaseUrl === null ? {} : { DATABASE_URL: testDatabaseUrl },
    exclude: baseExclude,
    // Slow machines (Docker on a busy Mac) hit the 5 s / 10 s defaults on the lint-rule and OTP tests
    testTimeout: 15_000,
    hookTimeout: 60_000,
    // jsdom costs about 0.5 s per file: only the component tests (*.test.tsx) get it
    projects: [
      {
        extends: true,
        test: { name: "node", environment: "node", pool: "vmThreads", include: ["tests/**/*.test.ts"], exclude: [...vmIncompatible, ...baseExclude] },
      },
      {
        extends: true,
        test: { name: "node-threads", environment: "node", pool: "threads", include: vmIncompatible, exclude: baseExclude },
      },
      { extends: true, test: { name: "dom", environment: "jsdom", pool: "vmThreads", include: ["tests/**/*.test.tsx"], exclude: baseExclude } },
    ],
  },
});
