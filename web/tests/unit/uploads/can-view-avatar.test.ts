import { beforeEach, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/permissions/current-user";
import { canViewAvatar } from "@/lib/uploads/can-view-avatar";
import { InMemoryAvatarAccessRepository } from "../../support/in-memory-avatar-access-repository";

const OWNER = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-000000000002";
const CLUB_A = "00000000-0000-0000-0000-00000000a001";
const CLUB_B = "00000000-0000-0000-0000-00000000b001";

function viewer(id: string, roleGlobal: "user" | "admin" = "user"): CurrentUser {
  return { id, email: `${id}@example.com`, nick: "runner", roleGlobal };
}

describe("canViewAvatar", () => {
  let repo: InMemoryAvatarAccessRepository;

  beforeEach(() => {
    repo = new InMemoryAvatarAccessRepository();
  });

  it("lets the owner see their own avatar, without asking the database", async () => {
    expect(await canViewAvatar(viewer(OWNER), OWNER, repo)).toBe(true);
    expect(repo.queries).toBe(0);
  });

  it("lets an Admin see any avatar, without asking the database", async () => {
    expect(await canViewAvatar(viewer(OTHER, "admin"), OWNER, repo)).toBe(true);
    expect(repo.queries).toBe(0);
  });

  it("lets a member of the same club see it", async () => {
    repo.addMembership(OWNER, CLUB_A);
    repo.addMembership(OTHER, CLUB_A);
    expect(await canViewAvatar(viewer(OTHER), OWNER, repo)).toBe(true);
  });

  it("lets a member see it when they share one club out of several", async () => {
    repo.addMembership(OWNER, CLUB_A);
    repo.addMembership(OWNER, CLUB_B);
    repo.addMembership(OTHER, CLUB_B);
    expect(await canViewAvatar(viewer(OTHER), OWNER, repo)).toBe(true);
  });

  it("hides it from a member of another club", async () => {
    repo.addMembership(OWNER, CLUB_A);
    repo.addMembership(OTHER, CLUB_B);
    expect(await canViewAvatar(viewer(OTHER), OWNER, repo)).toBe(false);
  });

  it("hides it from someone who left the club", async () => {
    // Membership has no "left" state: someone who left has no row in the club
    repo.addMembership(OWNER, CLUB_A);
    expect(await canViewAvatar(viewer(OTHER), OWNER, repo)).toBe(false);
  });

  it("lets an accepted Contact from another club see it, in either order of the pair", async () => {
    repo.addContact(OWNER, OTHER, "accepted");
    expect(await canViewAvatar(viewer(OTHER), OWNER, repo)).toBe(true);
    expect(await canViewAvatar(viewer(OWNER), OTHER, repo)).toBe(true);
  });

  it("hides it from a pending Contact", async () => {
    repo.addContact(OWNER, OTHER, "pending");
    expect(await canViewAvatar(viewer(OTHER), OWNER, repo)).toBe(false);
  });

  it("hides it from a stranger", async () => {
    expect(await canViewAvatar(viewer(OTHER), OWNER, repo)).toBe(false);
  });

  it("asks the club and the Contact questions at once, not one after the other", async () => {
    const started: string[] = [];
    // Neither query answers until the test calls answer()
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const slowRepo = {
      async shareAClub() {
        started.push("club");
        await answered;
        return false;
      },
      async areAcceptedContacts() {
        started.push("contact");
        await answered;
        return false;
      },
    };

    // Not awaited yet: an async function runs until its first await, so here
    // both queries have started only if they are not waiting for each other
    const result = canViewAvatar(viewer(OTHER), OWNER, slowRepo);
    expect(started).toEqual(["club", "contact"]);

    answer();
    expect(await result).toBe(false);
  });
});
