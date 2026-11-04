// Decides which database the tests may use (#83).
// Returns null when there is no test database (the *.db.test.ts files are then
// skipped). Throws if the database name does not end in _test, so the tests
// can never write to the development database by mistake.
export function resolveTestDatabaseUrl(env: Record<string, string | undefined>): string | null {
  const url = env.DATABASE_URL_TEST;
  // An empty value (e.g. DATABASE_URL_TEST= in a shell) also means "no test database"
  if (url === undefined || url === "") {
    // CI must run every test: a missing test database there is an error, not a skip
    // GitHub Actions sets CI=true; any other value (CI=false) is not CI
    if (env.CI === "true") {
      throw new Error("DATABASE_URL_TEST is required in CI, or the *.db.test.ts files would be skipped");
    }
    return null;
  }
  // The database name is the URL path without its leading "/"
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error(`DATABASE_URL_TEST must point to a database ending in _test, got "${databaseName}"`);
  }
  return url;
}
