// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { removeAvatar } from "@/lib/uploads/remove-avatar";

const url = process.env.DATABASE_URL_TEST;

const USER_ID = "99999999-9999-4999-8999-999999999992";

// An avatar upload and avatar removal at the same time (#130, #184)
describe("avatar removal and upload at the same time", { timeout: 30_000 }, () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  let uploadsDir: string;

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
    await db.user.create({ data: { id: USER_ID, email: "remove-race@example.test" } });
    uploadsDir = await mkdtemp(path.join(tmpdir(), "remove-race-"));
  });

  afterEach(async () => {
    await db.avatar.deleteMany({ where: { ownerId: USER_ID } });
    await db.user.deleteMany({ where: { id: USER_ID } });
    await rm(uploadsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("removeAvatar waits for an in-flight upload to commit and cleans it up completely", async () => {
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => (openGate = resolve));
    let reportPid!: (pid: number) => void;
    const uploadPid = new Promise<number>((resolve) => (reportPid = resolve));

    await mkdir(path.join(uploadsDir, "avatars"), { recursive: true });
    const filePath = path.join(uploadsDir, "avatars", "race.png");
    await writeFile(filePath, "png-bytes");

    // The upload transaction, held open before its commit
    const upload = db.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        const avatar = await tx.avatar.create({
          data: { ownerId: USER_ID, mimeType: "image/png", sizeBytes: 9, path: "avatars/race.png" },
        });
        await tx.user.update({ where: { id: USER_ID }, data: { image: `/api/files/${avatar.id}` } });
        reportPid(pid);
        await gate;
      },
      { isolationLevel: "ReadCommitted", timeout: 20_000 },
    );

    // removeAvatar runs in parallel and must wait for upload's lock on User row
    const removal = removeAvatar(USER_ID, db, uploadsDir);

    try {
      await waitUntilBlockedBy(await uploadPid);
    } finally {
      openGate();
      await Promise.allSettled([upload, removal]);
    }
    await upload;
    const removeResult = await removal;

    expect(removeResult).toEqual({ removed: true });

    // Consistent DB state
    const user = await db.user.findUnique({ where: { id: USER_ID } });
    expect(user?.image).toBeNull();
    expect(await db.avatar.count({ where: { ownerId: USER_ID } })).toBe(0);

    // Clean disk state
    expect(existsSync(filePath)).toBe(false);
  });
});
