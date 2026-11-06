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

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    env: testDatabaseUrl === null ? {} : { DATABASE_URL: testDatabaseUrl },
    exclude: testDatabaseUrl === null ? [...configDefaults.exclude, "**/*.db.test.ts"] : configDefaults.exclude,
  },
});
