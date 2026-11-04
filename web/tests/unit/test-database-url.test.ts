import { describe, expect, it } from "vitest";
import { resolveTestDatabaseUrl } from "../support/test-database-url";

describe("resolveTestDatabaseUrl", () => {
  it("returns null when DATABASE_URL_TEST is not set", () => {
    expect(resolveTestDatabaseUrl({})).toBeNull();
  });

  it("returns DATABASE_URL_TEST when its database name ends in _test", () => {
    const url = "postgresql://user:pass@db-test:5432/transcendence_test";
    expect(resolveTestDatabaseUrl({ DATABASE_URL_TEST: url })).toBe(url);
  });

  it("returns null when DATABASE_URL_TEST is empty", () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL_TEST: "" })).toBeNull();
  });

  it("refuses to skip the database tests in CI", () => {
    expect(() => resolveTestDatabaseUrl({ CI: "true" })).toThrow(/CI/);
  });

  it("returns DATABASE_URL_TEST in CI when it is set", () => {
    const url = "postgresql://user:pass@localhost:5432/transcendence_test";
    expect(resolveTestDatabaseUrl({ CI: "true", DATABASE_URL_TEST: url })).toBe(url);
  });

  it("skips the database tests when CI is not exactly true", () => {
    expect(resolveTestDatabaseUrl({ CI: "false" })).toBeNull();
  });

  it("refuses a database whose name does not end in _test", () => {
    const url = "postgresql://user:pass@db:5432/transcendence";
    expect(() => resolveTestDatabaseUrl({ DATABASE_URL_TEST: url })).toThrow(/_test/);
  });
});
