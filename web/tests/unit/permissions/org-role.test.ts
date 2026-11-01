import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOrgRole } from "@/lib/permissions/org-role";
import type { CurrentUserResult } from "@/lib/permissions/current-user";
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

  it("returns the Athlete role when both roles may act", async () => {
    repo.add(USER_ID, CLUB, "athlete");

    const result = await getOrgRole(CLUB, ["manager", "athlete"], activeUser, repo);

    expect(result).toEqual({
      ok: true,
      user: { id: USER_ID, email: "runner@42madrid.com", nick: "runner42", roleGlobal: "user" },
      role: "athlete",
    });
  });

  it("rejects an Admin as not-member when they have no membership in the club", async () => {
    // Admin is a platform role: its own permissions go through requireAdmin (#50)
    const admin = async (): Promise<CurrentUserResult> => ({
      ok: true,
      user: { id: USER_ID, email: "admin@42madrid.com", nick: "admin42", roleGlobal: "admin" },
    });

    const result = await getOrgRole(CLUB, ["manager", "athlete"], admin, repo);

    expect(result).toEqual({ ok: false, reason: "not-member" });
  });
});
