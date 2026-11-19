// @vitest-environment node
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaUserRepository } from "@/lib/auth/user-repository";

const url = process.env.DATABASE_URL_TEST;

const USER_ID = "99999999-9999-4999-8999-999999999993";

// Health data purge and an in-flight Feedback write at the same time (#126, #131, #210)
describe("purgeHealthData and in-flight Feedback at the same time", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const repo = new PrismaUserRepository(db);

  async function pollUntil(check: () => Promise<boolean>, failure: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await sleep(20);
    }
    throw new Error(`${failure} within 5 s`);
  }

  async function waitUntilBlockedBy(holderPid: number): Promise<void> {
    await pollUntil(async () => {
      const [row] = await db.$queryRaw<{ blocked: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))
        ) AS blocked`;
      return row.blocked;
    }, `No connection was blocked by ${holderPid}`);
  }

  beforeEach(async () => {
    await db.user.create({
      data: {
        id: USER_ID,
        email: "purge-race@example.test",
        healthConsentAt: new Date(),
        healthConsentVersion: 1,
      },
    });
  });

  afterEach(async () => {
    await db.auditLog.deleteMany({ where: { actorId: USER_ID } });
    await db.feedback.deleteMany({ where: { athleteId: USER_ID } });
    await db.user.deleteMany({ where: { id: USER_ID } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("purgeHealthData waits for an in-flight feedback transaction to commit and deletes it", async () => {
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    let reportPid!: (pid: number) => void;
    const feedbackPid = new Promise<number>((resolve) => (reportPid = resolve));

    // Simulates Phase 3 Feedback save: locks user row first, checks consent, waits before insert
    const feedbackTx = db.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${USER_ID} FOR UPDATE`;
        const athlete = await tx.user.findUniqueOrThrow({
          where: { id: USER_ID },
          select: { healthConsentAt: true },
        });
        expect(athlete.healthConsentAt).not.toBeNull();
        reportPid(pid);
        await gate;
        await tx.feedback.create({
          data: { athleteId: USER_ID, body: "Buen ritmo" },
        });
      },
      { isolationLevel: "ReadCommitted", timeout: 20_000 }
    );

    const holderPid = await feedbackPid;

    // Start purge only after feedbackTx holds the FOR UPDATE lock on the User row
    const purge = repo.purgeHealthData(USER_ID);

    try {
      await waitUntilBlockedBy(holderPid);
    } finally {
      openGate();
      await Promise.allSettled([feedbackTx, purge]);
    }
    await feedbackTx;
    await purge;

    expect(await db.feedback.count({ where: { athleteId: USER_ID } })).toBe(0);
  });
});
