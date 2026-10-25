import type { Session } from "next-auth";
import { beforeEach, describe, expect, it } from "vitest";
import { getCurrentUser } from "@/lib/permissions/current-user";
import { InMemoryCurrentUserRepository } from "../../support/in-memory-current-user-repository";

// A session as Auth.js returns it; fields may be missing, as in auth.config.ts
function sessionFor(user: Partial<Session["user"]>) {
  return async () => ({ user, expires: "2099-01-01T00:00:00.000Z" }) as Session;
}

describe("getCurrentUser", () => {
  let repo: InMemoryCurrentUserRepository;

  beforeEach(() => {
    repo = new InMemoryCurrentUserRepository();
  });

  it("rejects as no-session when there is no session", async () => {
    const noSession = async () => null;

    const result = await getCurrentUser(noSession, repo);

    expect(result).toEqual({ ok: false, reason: "no-session" });
  });

  it("returns the user when the session is valid and the user is active", async () => {
    repo.add({
      id: "athlete-1",
      email: "athlete@42madrid.com",
      nick: "athlete42",
      roleGlobal: "user",
      blockedAt: null,
    });
    const session = sessionFor({ id: "athlete-1" });

    const result = await getCurrentUser(session, repo);

    expect(result).toEqual({
      ok: true,
      user: {
        id: "athlete-1",
        email: "athlete@42madrid.com",
        nick: "athlete42",
        roleGlobal: "user",
      },
    });
  });

  it("rejects as no-session when the user was deleted after logging in", async () => {
    // The JWT is still valid, but the user is no longer in the database
    const session = sessionFor({ id: "deleted-user" });

    const result = await getCurrentUser(session, repo);

    expect(result).toEqual({ ok: false, reason: "no-session" });
  });

  it("rejects as no-session when the session has no user id", async () => {
    // auth.config.ts only copies the id into the session when the JWT has one
    const session = sessionFor({ email: "athlete@42madrid.com" });

    const result = await getCurrentUser(session, repo);

    expect(result).toEqual({ ok: false, reason: "no-session" });
  });

  it("rejects as blocked when an admin blocked the user", async () => {
    repo.add({
      id: "blocked-1",
      email: "blocked@42madrid.com",
      nick: "blocked42",
      roleGlobal: "user",
      blockedAt: new Date("2026-10-20T10:00:00.000Z"),
    });
    const session = sessionFor({ id: "blocked-1" });

    const result = await getCurrentUser(session, repo);

    expect(result).toEqual({ ok: false, reason: "blocked" });
  });

  it("returns the role from the database, not the one in the JWT", async () => {
    repo.add({
      id: "promoted-1",
      email: "promoted@42madrid.com",
      nick: "promoted42",
      roleGlobal: "admin",
      blockedAt: null,
    });
    // The JWT was issued before an admin changed the role
    const session = sessionFor({ id: "promoted-1", roleGlobal: "user" });

    const result = await getCurrentUser(session, repo);

    expect(result).toEqual({
      ok: true,
      user: {
        id: "promoted-1",
        email: "promoted@42madrid.com",
        nick: "promoted42",
        roleGlobal: "admin",
      },
    });
  });
});
