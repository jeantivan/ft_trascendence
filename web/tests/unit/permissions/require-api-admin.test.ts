import { describe, expect, it, vi } from "vitest";
import { requireApiAdmin } from "@/lib/permissions/require-api-admin";
import type { AdminResult } from "@/lib/permissions/admin";

// Every test passes its own check: the mock only keeps next-auth from loading
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const ADMIN = { id: "admin-1", email: "admin@42madrid.com", nick: "admin42", roleGlobal: "admin" } as const;

describe("requireApiAdmin", () => {
  it.each(["no-session", "blocked"] as const)("answers 401 JSON when the reason is %s", async (reason) => {
    const rejected = async (): Promise<AdminResult> => ({ ok: false, reason });

    const result = await requireApiAdmin(rejected);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "Unauthorized" });
  });

  it("answers 403 JSON when the user has a session but is not an Admin", async () => {
    const notAdmin = async (): Promise<AdminResult> => ({ ok: false, reason: "not-admin" });

    const result = await requireApiAdmin(notAdmin);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) return;
    expect(result.status).toBe(403);
    expect(await result.json()).toEqual({ error: "Forbidden" });
  });

  it("returns the Admin when the check accepts it", async () => {
    const admin = async (): Promise<AdminResult> => ({ ok: true, user: ADMIN });

    expect(await requireApiAdmin(admin)).toEqual(ADMIN);
  });
});
