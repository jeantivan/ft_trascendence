import { randomInt } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { OtpPurpose } from "@/generated/prisma/client";

export interface OtpRecord {
  id: string;
  userId: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

const OTP_TTL_MS = 10 * 60 * 1000;

export interface OtpRepository {
  create(record: Omit<OtpRecord, "id">): Promise<OtpRecord>;
  findLatest(userId: string, purpose: OtpPurpose): Promise<OtpRecord | null>;
  // Atomically marks that exact code as used. Returns false if it was already used.
  consumeIfUnused(recordId: string, now: Date): Promise<boolean>;
}

export type VerifyOtpResult = { success: true } | { success: false; reason: "invalid" };

// Returns the plain code (to send by email). Only its hash is stored.
export async function issueOtp(
  userId: string,
  purpose: OtpPurpose,
  repo: OtpRepository,
  now: Date = new Date(),
): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const codeHash = await hashPassword(code);
  await repo.create({ userId, purpose, codeHash, expiresAt, consumedAt: null });
  return code;
}

export async function verifyOtp(
  userId: string,
  purpose: OtpPurpose,
  code: string,
  repo: OtpRepository,
  now: Date = new Date(),
): Promise<VerifyOtpResult> {
  const record = await repo.findLatest(userId, purpose);
  if (
    !record ||
    record.consumedAt ||
    now >= record.expiresAt ||
    !(await verifyPassword(code, record.codeHash))
  ) {
    return { success: false, reason: "invalid" };
  }
  if (!(await repo.consumeIfUnused(record.id, now))) {
    return { success: false, reason: "invalid" };
  }
  return { success: true };
}
