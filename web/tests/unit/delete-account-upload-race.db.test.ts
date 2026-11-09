// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { deleteWithFreshOtp } from "../support/delete-account-helper";

const url = process.env.DATABASE_URL_TEST;

const USER_ID = "99999999-9999-4999-8999-999999999991";

// An avatar upload and the deletion of the same account at the same time (#122)
describe("account deletion and avatar upload at the same time", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  let uploadsDir: string;
  let conversationId: string | undefined;

  // Asks Postgres every 20 ms until check() is true; fails after 5 s instead of hanging
  async function pollUntil(check: () => Promise<boolean>, failure: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await sleep(20);
    }
    throw new Error(`${failure} within 5 s`);
  }

  // Some connection is waiting for a lock held by holderPid (a transaction the test opened).
  // Filtered by holder, not "anyone waiting": other test files share this database.
  async function waitUntilBlockedBy(holderPid: number): Promise<void> {
    await pollUntil(async () => {
      const [row] = await db.$queryRaw<{ blocked: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE ${holderPid}::int = ANY (pg_blocking_pids(pid))
        ) AS blocked`;
      return row.blocked;
    }, `No connection was blocked by ${holderPid}`);
  }

  // The connection waiterPid is waiting for a lock, whoever holds it
  async function waitUntilBlocked(waiterPid: number): Promise<void> {
    await pollUntil(async () => {
      const [row] = await db.$queryRaw<{ blocked: boolean }[]>`
        SELECT cardinality(pg_blocking_pids(${waiterPid}::int)) > 0 AS blocked`;
      return row.blocked;
    }, `Connection ${waiterPid} was not blocked`);
  }

  beforeEach(async () => {
    await db.user.create({ data: { id: USER_ID, email: "upload-race@example.test" } });
    uploadsDir = await mkdtemp(path.join(tmpdir(), "upload-race-"));
  });

  afterEach(async () => {
    // The deletion leaves an account_deleted row with no foreign key: it outlives the user
    await db.auditLog.deleteMany({ where: { subjectId: USER_ID } });
    // The deletion removes the DM when it passes; a failing test may leave it behind
    if (conversationId) await db.conversation.deleteMany({ where: { id: conversationId } });
    conversationId = undefined;
    // deleteMany: after a passing test the user is already gone, and delete would throw
    await db.user.deleteMany({ where: { id: USER_ID } });
    await rm(uploadsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("an upload that commits while the deletion waits leaves no avatar file behind", async () => {
    // Gates: Promises the test resolves by hand to order the two transactions
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    let reportPid!: (pid: number) => void;
    const uploadPid = new Promise<number>((resolve) => (reportPid = resolve));

    // The upload, with the same steps as app/api/upload/route.ts (disk first, then
    // avatar.create and user.update), held open before its commit
    await mkdir(path.join(uploadsDir, "avatars"));
    await writeFile(path.join(uploadsDir, "avatars", "race.png"), "png");
    const upload = db.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        const avatar = await tx.avatar.create({
          data: { ownerId: USER_ID, mimeType: "image/png", sizeBytes: 3, path: "avatars/race.png" },
        });
        await tx.user.update({ where: { id: USER_ID }, data: { image: `/api/files/${avatar.id}` } });
        reportPid(pid);
        await gate;
      },
      { isolationLevel: "ReadCommitted", timeout: 20_000 },
    );

    const deletion = deleteWithFreshOtp(USER_ID, db, db, uploadsDir);
    try {
      await waitUntilBlockedBy(await uploadPid);
    } finally {
      openGate(); // also on failure, or the open transaction would hang the cleanup
      // Both finished before afterEach cleans up; allSettled never throws, so a failure above keeps its error
      await Promise.allSettled([upload, deletion]);
    }
    await upload;

    expect(await deletion).toEqual({ deleted: true });
    expect(await db.avatar.count({ where: { ownerId: USER_ID } })).toBe(0);
    expect(existsSync(path.join(uploadsDir, "avatars", "race.png"))).toBe(false);
  });

  it("an upload that arrives while the deletion holds the lock fails on the foreign key, without a deadlock", async () => {
    // A DM of the user, locked by the test: the deletion stops there with the user row already locked
    const conversation = await db.conversation.create({
      data: { kind: "dm", participants: { create: [{ userId: USER_ID }] } },
    });
    conversationId = conversation.id;
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    let reportHolderPid!: (pid: number) => void;
    const holderPid = new Promise<number>((resolve) => (reportHolderPid = resolve));
    const holder = db.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversation.id}::uuid FOR UPDATE`;
        reportHolderPid(pid);
        await gate;
      },
      { timeout: 20_000 },
    );

    const deletion = deleteWithFreshOtp(USER_ID, db, db, uploadsDir);
    let uploadOutcome: Promise<unknown> | undefined;
    try {
      await waitUntilBlockedBy(await holderPid);

      // The upload's database steps, as in app/api/upload/route.ts
      let reportUploadPid!: (pid: number) => void;
      const uploadPid = new Promise<number>((resolve) => (reportUploadPid = resolve));
      const upload = db.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          reportUploadPid(pid);
          const avatar = await tx.avatar.create({
            data: { ownerId: USER_ID, mimeType: "image/png", sizeBytes: 3, path: "avatars/late.png" },
          });
          await tx.user.update({ where: { id: USER_ID }, data: { image: `/api/files/${avatar.id}` } });
        },
        { isolationLevel: "ReadCommitted", timeout: 20_000 },
      );
      // Settled now, so the expected rejection is not reported as unhandled while the test waits
      uploadOutcome = upload.then(() => "committed", (error: unknown) => error);
      await waitUntilBlocked(await uploadPid);
    } finally {
      openGate();
      // As in the first test; uploadOutcome is undefined if the failure came before the upload started
      await Promise.allSettled([holder, deletion, uploadOutcome]);
    }
    await holder;

    expect(await deletion).toEqual({ deleted: true });
    // P2003: Prisma's foreign key error. A deadlock would be a different error (or fail the deletion)
    expect(await uploadOutcome).toMatchObject({ code: "P2003" });
  });
});
