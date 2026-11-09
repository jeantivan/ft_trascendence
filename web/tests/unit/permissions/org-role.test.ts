import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrgRole } from "@/lib/permissions/org-role";
import { getCurrentUser, type CurrentUserResult } from "@/lib/permissions/current-user";
import type { CurrentUserRecord, CurrentUserRepository } from "@/lib/permissions/current-user-repository";
import { InMemoryMembershipRepository } from "../../support/in-memory-membership-repository";

// Every test passes its own user: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const CLUB = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const OTHER_CLUB = "9d8e7f6a-5b4c-4d3e-a2f1-0e9d8c7b6a50";
const USER_ID = "0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d";

// getCurrentUser already passed: an active user with a session
async function activeUser(): Promise<CurrentUserResult> {
  return {
    ok: true,
    user: { id: USER_ID, email: "runner@42madrid.com", nick: "runner42", roleGlobal: "user" },
  };
}

describe("getOrgRole", () => {
  let repo: InMemoryMembershipRepository;

  beforeEach(() => {
    repo = new InMemoryMembershipRepository();
  });

  it("rejects as no-session when there is no session", async () => {
    const noUser = async (): Promise<CurrentUserResult> => ({
      ok: false,
      reason: "no-session",
    });

    const result = await getOrgRole(CLUB, ["manager"], noUser, repo);

    expect(result).toEqual({ ok: false, reason: "no-session" });
  });

  it("rejects as blocked when an admin blocked the user", async () => {
    const blockedUser = async (): Promise<CurrentUserResult> => ({
      ok: false,
      reason: "blocked",
    });

    const result = await getOrgRole(CLUB, ["manager"], blockedUser, repo);

    expect(result).toEqual({ ok: false, reason: "blocked" });
  });

  it("rejects as not-member when the club id is not a UUID, without asking the database", async () => {
    // A malformed id in the URL must give 404, not a database error (500)
    const result = await getOrgRole("not-a-uuid", ["manager"], activeUser, repo);

    expect(result).toEqual({ ok: false, reason: "not-member" });
  });

  it("rejects as not-member when the user belongs only to another club", async () => {
    repo.add(USER_ID, OTHER_CLUB, "manager");

    const result = await getOrgRole(CLUB, ["manager"], activeUser, repo);

    expect(result).toEqual({ ok: false, reason: "not-member" });
  });

  it("rejects as wrong-role when the user is an Athlete and only Managers may act", async () => {
    repo.add(USER_ID, CLUB, "athlete");

    const result = await getOrgRole(CLUB, ["manager"], activeUser, repo);

    expect(result).toEqual({ ok: false, reason: "wrong-role" });
  });

  it("returns the user and their role when a Manager acts in their club", async () => {
    repo.add(USER_ID, CLUB, "manager");

    const result = await getOrgRole(CLUB, ["manager"], activeUser, repo);

    expect(result).toEqual({
      ok: true,
      user: { id: USER_ID, email: "runner@42madrid.com", nick: "runner42", roleGlobal: "user" },
      role: "manager",
    });
  });

  it("accepts a club id that Postgres accepts but is not a v4 UUID, like the seed's fixed ids", async () => {
    const seedClub = "00000000-0000-0000-0000-000000000001";
    repo.add(USER_ID, seedClub, "athlete");

    const result = await getOrgRole(seedClub, ["athlete"], activeUser, repo);

    expect(result).toMatchObject({ ok: true, role: "athlete" });
  });

  it("returns the Athlete role when both roles may act", async () => {
    repo.add(USER_ID, CLUB, "athlete");

    const result = await getOrgRole(CLUB, ["manager", "athlete"], activeUser, repo);

    expect(result).toEqual({
      ok: true,
      user: { id: USER_ID, email: "runner@42madrid.com", nick: "runner42", roleGlobal: "user" },
      role: "athlete",
    });
  });

  describe("Admin", () => {
    const ADMIN_ID = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";

    const ADMIN_USER = { id: ADMIN_ID, email: "admin@42madrid.com", nick: "admin42", roleGlobal: "admin" } as const;

    // getCurrentUser already passed: roleGlobal comes from the database
    async function admin(): Promise<CurrentUserResult> {
      return { ok: true, user: ADMIN_USER };
    }

    it("rejects a blocked Admin as blocked, even in a row that allows admin", async () => {
      // The real getCurrentUser, with an Admin account that is blocked in the database
      const blockedAdmin: CurrentUserRecord = { ...ADMIN_USER, blockedAt: new Date("2026-11-09T10:00:00Z") };
      const users: CurrentUserRepository = { findById: async (id) => (id === ADMIN_ID ? blockedAdmin : null) };
      const session = async () => ({ user: { id: ADMIN_ID }, expires: "2099-01-01T00:00:00.000Z" });
      repo.addOrganization(CLUB);

      const result = await getOrgRole(CLUB, ["manager", "admin"], () => getCurrentUser(session, users), repo);

      expect(result).toEqual({ ok: false, reason: "blocked" });
    });

    it("lets in an Admin who is not a member when the row allows admin, as role admin", async () => {
      repo.addOrganization(CLUB);

      const result = await getOrgRole(CLUB, ["manager", "admin"], admin, repo);

      expect(result).toEqual({ ok: true, user: ADMIN_USER, role: "admin" });
    });

    it("rejects an Admin who is not a member as not-member when the row does not allow admin", async () => {
      repo.addOrganization(CLUB);

      const result = await getOrgRole(CLUB, ["manager", "athlete"], admin, repo);

      expect(result).toEqual({ ok: false, reason: "not-member" });
    });

    it("rejects an Admin as not-member when the club does not exist", async () => {
      const result = await getOrgRole(CLUB, ["manager", "admin"], admin, repo);

      expect(result).toEqual({ ok: false, reason: "not-member" });
    });

    it("rejects an Admin as not-member when the club id is not a UUID, without asking the database", async () => {
      // The id check returns first; the in-memory repository would throw, like Prisma
      const result = await getOrgRole("not-a-uuid", ["manager", "admin"], admin, repo);

      expect(result).toEqual({ ok: false, reason: "not-member" });
    });

    it("lets in an Admin who is an Athlete of the club as role admin when the row allows admin, even if it allows athlete too", async () => {
      // group.read: as Admin they see every Group, as Athlete only their own
      repo.add(ADMIN_ID, CLUB, "athlete");

      const result = await getOrgRole(CLUB, ["manager", "athlete", "admin"], admin, repo);

      expect(result).toEqual({ ok: true, user: ADMIN_USER, role: "admin" });
    });

    it("lets in an Admin who is an Athlete of the club with their club role when the row does not allow admin", async () => {
      // session.read: their own sessions, as any Athlete
      repo.add(ADMIN_ID, CLUB, "athlete");

      const result = await getOrgRole(CLUB, ["manager", "athlete"], admin, repo);

      expect(result).toEqual({ ok: true, user: ADMIN_USER, role: "athlete" });
    });

    it("lets in an Admin who is an Athlete of the club as role admin when only Managers and Admins may act", async () => {
      repo.add(ADMIN_ID, CLUB, "athlete");

      const result = await getOrgRole(CLUB, ["manager", "admin"], admin, repo);

      expect(result).toEqual({ ok: true, user: ADMIN_USER, role: "admin" });
    });

    it("keeps an Admin who is a Manager of the club as role manager when the row allows manager and admin", async () => {
      // eventChat.moderate: as Manager they delete any message, as Admin only reported ones
      repo.add(ADMIN_ID, CLUB, "manager");

      const result = await getOrgRole(CLUB, ["manager", "admin"], admin, repo);

      expect(result).toEqual({ ok: true, user: ADMIN_USER, role: "manager" });
    });

    it("rejects an Admin who is an Athlete of the club as wrong-role when the row allows neither", async () => {
      repo.add(ADMIN_ID, CLUB, "athlete");

      const result = await getOrgRole(CLUB, ["manager"], admin, repo);

      expect(result).toEqual({ ok: false, reason: "wrong-role" });
    });

    it("rejects a user who is not an Admin as not-member when the row allows admin", async () => {
      repo.addOrganization(CLUB);

      const result = await getOrgRole(CLUB, ["manager", "admin"], activeUser, repo);

      expect(result).toEqual({ ok: false, reason: "not-member" });
    });
  });
});
