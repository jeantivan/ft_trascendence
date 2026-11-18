// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// vi.mock runs before the rest of the file, so its values are created with vi.hoisted
const { prisma, purgeOldAuditRows } = vi.hoisted(() => ({
  prisma: { fake: "prisma client" },
  purgeOldAuditRows: vi.fn(async () => 4),
}));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/gdpr/audit", () => ({ purgeOldAuditRows }));

import { JOBS } from "@/lib/jobs/jobs";

describe("JOBS", () => {
  it("purges the audit_log rows older than 12 months with the app's database and today's date", async () => {
    const job = JOBS.find((j) => j.name === "audit_log purge");
    expect(job).toBeDefined();

    const before = Date.now();
    expect(await job!.run()).toBe(4);
    const [db, now] = purgeOldAuditRows.mock.calls[0] as unknown as [unknown, Date];
    expect(db).toBe(prisma);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
  });
});
