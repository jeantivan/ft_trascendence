import { randomInt } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { OtpPurpose } from "@/generated/prisma/client";

export interface OtpRecord {
  userId: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: Date;
}

const OTP_TTL_MS = 10 * 60 * 1000;

export interface OtpRepository {
  create(record: OtpRecord): Promise<void>;
  findLatest(userId: string, purpose: OtpPurpose): Promise<OtpRecord | null>;
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
  await repo.create({ userId, purpose, codeHash: await hashPassword(code), expiresAt });
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
  if (!record || now >= record.expiresAt || !(await verifyPassword(code, record.codeHash))) {
    return { success: false, reason: "invalid" };
  }
  return { success: true };
}
