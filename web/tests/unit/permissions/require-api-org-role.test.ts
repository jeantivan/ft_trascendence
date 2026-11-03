import { describe, expect, it, vi } from "vitest";
import { requireApiOrgRole } from "@/lib/permissions/require-api-org-role";
import type { OrgRoleResult } from "@/lib/permissions/org-role";

// Every test passes its own getOrgRole: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const CLUB = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";

function decides(result: OrgRoleResult) {
  return async () => result;
}

describe("requireApiOrgRole", () => {
  it.each(["no-session", "blocked"] as const)(
    "answers 401 JSON when the reason is %s",
    async (reason) => {
      const result = await requireApiOrgRole(CLUB, ["manager"], decides({ ok: false, reason }));

      expect(result).toBeInstanceOf(Response);
      if (!(result instanceof Response)) return;
      expect(result.status).toBe(401);
      expect(await result.json()).toEqual({ error: "Unauthorized" });
    }
  );

  it("answers 404 JSON when the user is not a member of the club", async () => {
    // Same answer as a club that does not exist: nobody can probe which ids exist
    const result = await requireApiOrgRole(
      CLUB,
      ["manager"],
      decides({ ok: false, reason: "not-member" })
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(404);
    expect(await result.json()).toEqual({ error: "Not Found" });
  });

  it("answers 403 JSON when the user is a member without the role", async () => {
    const result = await requireApiOrgRole(
      CLUB,
      ["manager"],
      decides({ ok: false, reason: "wrong-role" })
    );

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(403);
    expect(await result.json()).toEqual({ error: "Forbidden" });
  });

  it("returns the user and their role when getOrgRole accepts them", async () => {
    const user = {
      id: "athlete-1",
      email: "athlete@42madrid.com",
      nick: "athlete42",
      roleGlobal: "user",
    } as const;

    const result = await requireApiOrgRole(
      CLUB,
      ["manager", "athlete"],
      decides({ ok: true, user, role: "athlete" })
    );

    expect(result).toEqual({ user, role: "athlete" });
  });
});
