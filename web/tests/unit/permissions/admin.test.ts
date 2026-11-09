import { describe, expect, it, vi } from "vitest";
import { getAdmin } from "@/lib/permissions/admin";
import { getCurrentUser, type CurrentUserResult } from "@/lib/permissions/current-user";
import type { CurrentUserRecord, CurrentUserRepository } from "@/lib/permissions/current-user-repository";

// Every test passes its own user: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const ADMIN = { id: "admin-1", email: "admin@42madrid.com", nick: "admin42", roleGlobal: "admin" } as const;
const RUNNER = { id: "runner-1", email: "runner@42madrid.com", nick: "runner42", roleGlobal: "user" } as const;

// A valid session whose JWT carries this id and, optionally, a role
const sessionFor = (id: string, roleGlobal?: "admin" | "user") => async () => ({
  user: { id, roleGlobal },
  expires: "2099-01-01T00:00:00.000Z",
});

describe("getAdmin", () => {
  it("rejects as no-session when there is no session", async () => {
    const noSession = async (): Promise<CurrentUserResult> => ({ ok: false, reason: "no-session" });

    expect(await getAdmin(noSession)).toEqual({ ok: false, reason: "no-session" });
  });

  it("passes blocked through", async () => {
    const blocked = async (): Promise<CurrentUserResult> => ({ ok: false, reason: "blocked" });

    expect(await getAdmin(blocked)).toEqual({ ok: false, reason: "blocked" });
  });

  it("rejects a blocked Admin: the block is checked before the role", async () => {
    // The real getCurrentUser, with an Admin account that is blocked in the database
    const blockedAdmin: CurrentUserRecord = { ...ADMIN, blockedAt: new Date("2026-11-07T10:00:00Z") };
    const repo: CurrentUserRepository = { findById: async (id) => (id === ADMIN.id ? blockedAdmin : null) };

    expect(await getAdmin(() => getCurrentUser(sessionFor(ADMIN.id), repo))).toEqual({ ok: false, reason: "blocked" });
  });

  it("rejects as not-admin when the JWT says admin but the database says user", async () => {
    const runnerRecord: CurrentUserRecord = { ...RUNNER, blockedAt: null };
    const repo: CurrentUserRepository = { findById: async (id) => (id === RUNNER.id ? runnerRecord : null) };

    expect(await getAdmin(() => getCurrentUser(sessionFor(RUNNER.id, "admin"), repo))).toEqual({
      ok: false,
      reason: "not-admin",
    });
  });

  it("rejects as no-session when the Admin was deleted but the JWT is still valid", async () => {
    const repo: CurrentUserRepository = { findById: async () => null };

    expect(await getAdmin(() => getCurrentUser(sessionFor(ADMIN.id, "admin"), repo))).toEqual({
      ok: false,
      reason: "no-session",
    });
  });

  it("rejects as not-admin when the user is not an Admin", async () => {
    const runner = async (): Promise<CurrentUserResult> => ({ ok: true, user: RUNNER });

    expect(await getAdmin(runner)).toEqual({ ok: false, reason: "not-admin" });
  });

  it("accepts an Admin and returns the user", async () => {
    const admin = async (): Promise<CurrentUserResult> => ({ ok: true, user: ADMIN });

    expect(await getAdmin(admin)).toEqual({ ok: true, user: ADMIN });
  });
});
