// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// vi.mock runs before the rest of the file, so its values are created with vi.hoisted
const { prisma, purgeOldAuditRows, sweepOrphanAvatars, purgeExpiredExports } = vi.hoisted(() => ({
  prisma: { fake: "prisma client" },
  purgeOldAuditRows: vi.fn(async () => 4),
  sweepOrphanAvatars: vi.fn(async () => 3),
  purgeExpiredExports: vi.fn(async () => 2),
}));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/gdpr/audit", () => ({ purgeOldAuditRows }));
vi.mock("@/lib/uploads/sweep-orphan-avatars", () => ({ sweepOrphanAvatars }));
vi.mock("@/lib/gdpr/export/purge-expired-exports", () => ({ purgeExpiredExports }));

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

  // The uploads volume as docker-compose.yml mounts it in the app container
  it("sweeps the orphan avatar files with the app's database, the uploads volume and today's date", async () => {
    const job = JOBS.find((j) => j.name === "orphan avatar sweep");
    expect(job).toBeDefined();

    const before = Date.now();
    expect(await job!.run()).toBe(3);
    const [db, uploadsDir, now] = sweepOrphanAvatars.mock.calls[0] as unknown as [unknown, string, Date];
    expect(db).toBe(prisma);
    expect(uploadsDir).toBe("/data/uploads");
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("purges the expired exports with the app's database, the uploads volume and today's date", async () => {
    const job = JOBS.find((j) => j.name === "export purge");
    expect(job).toBeDefined();

    const before = Date.now();
    expect(await job!.run()).toBe(2);
    const [db, uploadsDir, now] = purgeExpiredExports.mock.calls[0] as unknown as [unknown, string, Date];
    expect(db).toBe(prisma);
    expect(uploadsDir).toBe("/data/uploads");
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
  });
});
