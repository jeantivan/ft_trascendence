// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { deliverExport } from "@/lib/gdpr/export/deliver-export";
import type { MailMessage, MailSender } from "@/lib/mail/mail-sender";

// These tests write rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

const USER_ID = "99999999-9999-4999-8999-999999999999";
const EMAIL = "deliver-export@example.test";
const NOW = new Date("2026-11-15T12:00:00.000Z");
const ORIGIN = "https://example.test:8443";

function recordingMailer(): { sent: MailMessage[]; mailer: () => MailSender } {
  const sent: MailMessage[] = [];
  return { sent, mailer: () => ({ send: async (message) => void sent.push(message) }) };
}

describe("deliverExport", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  let uploadsDir: string;

  beforeEach(async () => {
    uploadsDir = await mkdtemp(path.join(tmpdir(), "deliver-export-uploads-"));
    await db.user.create({ data: { id: USER_ID, email: EMAIL, nick: "runner-nick" } });
  });

  afterEach(async () => {
    await db.user.deleteMany({ where: { id: USER_ID } });
    await rm(uploadsDir, { recursive: true, force: true });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("emails the user the download link with the token and the expiry date, and keeps the export ready", async () => {
    const { id } = await db.dataExport.create({ data: { userId: USER_ID } });
    const { sent, mailer } = recordingMailer();

    const delivered = await deliverExport(id, ORIGIN, mailer, db, uploadsDir, NOW);

    expect(delivered).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(EMAIL);
    expect(sent[0].text).toMatch(new RegExp(`${ORIGIN}/api/gdpr/export/${id}/download\\?token=[A-Za-z0-9_-]{43}`));
    expect(sent[0].text).toContain("2026-11-22");
    const row = await db.dataExport.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("ready");
    expect(existsSync(path.join(uploadsDir, `exports/${id}.zip`))).toBe(true);
  });

  it("puts no user data in the message beyond the recipient address", async () => {
    const { id } = await db.dataExport.create({ data: { userId: USER_ID } });
    const { sent, mailer } = recordingMailer();

    await deliverExport(id, ORIGIN, mailer, db, uploadsDir, NOW);

    expect(sent[0].subject + sent[0].text).not.toMatch(/runner-nick|deliver-export@/);
  });

  it("marks the export failed and removes the ZIP when the email cannot be sent", async () => {
    const { id } = await db.dataExport.create({ data: { userId: USER_ID } });
    const failing = () => ({ send: async () => Promise.reject(new Error("smtp down")) });

    const delivered = await deliverExport(id, ORIGIN, failing, db, uploadsDir, NOW);

    expect(delivered).toBe(false);
    const row = await db.dataExport.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "failed", tokenHash: null, path: null, expiresAt: null });
    expect(existsSync(path.join(uploadsDir, `exports/${id}.zip`))).toBe(false);
  });

  it("sends nothing when the export cannot be generated", async () => {
    const { sent, mailer } = recordingMailer();

    const delivered = await deliverExport("00000000-0000-4000-8000-000000000000", ORIGIN, mailer, db, uploadsDir, NOW);

    expect(delivered).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
