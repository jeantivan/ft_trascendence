import { randomInt, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { OtpPurpose } from "@/generated/prisma/client";

export interface OtpRecord {
  id: string;
  userId: string;
  purpose: OtpPurpose;
  codeHash: string;
  // findLatest orders by this; the database fills it on its own when omitted
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  // Hash checks reserved with reserveAttempt (a correct one counts too)
  attempts: number;
}

const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
const OTP_COOLDOWN_MS = 60 * 1000;

export interface OtpRepository {
  // attempts starts at 0 (same as the schema default)
  // findLatest returns the code with the greatest createdAt, not the last inserted;
  // ties go to the greatest id (Prisma: orderBy [{ createdAt: "desc" }, { id: "desc" }])
  create(record: Omit<OtpRecord, "id" | "attempts">): Promise<OtpRecord>;
  findLatest(userId: string, purpose: OtpPurpose): Promise<OtpRecord | null>;
  // Atomically reserves one of the OTP_MAX_ATTEMPTS checks, only if the code is
  // unused and not expired. Must be a single conditional write (in SQL:
  // UPDATE ... SET attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL
  // AND expires_at > now AND attempts < max, then check 1 row changed), never
  // read-then-write, so concurrent calls cannot reserve more than the limit.
  // Returns false if it did not reserve.
  reserveAttempt(recordId: string, now: Date): Promise<boolean>;
  // Atomically marks that exact code as used, only if it exists, is unused and is
  // not expired. Returns true only if it consumed the code; false otherwise,
  // leaving the record unchanged. The attempt limit is enforced by reserveAttempt.
  consumeIfUnused(recordId: string, now: Date): Promise<boolean>;
}

export type VerifyOtpResult = { success: true } | { success: false; reason: "invalid" };

// Hash of a random value nobody knows, computed once with the same cost as real
// codes. Rejections compare against it so they take as long as a real check.
let dummyHash: Promise<string> | undefined;

async function rejectInvalid(code: string): Promise<VerifyOtpResult> {
  dummyHash ??= hashPassword(randomUUID());
  await verifyPassword(code, await dummyHash);
  return { success: false, reason: "invalid" };
}

export type IssueOtpResult =
  | { issued: true; code: string }
  | { issued: false; retryAfterSeconds: number };

// Returns the plain code (to send by email). Only its hash is stored.
// Refuses to issue another one for the same user and purpose until the cooldown
// has passed, so requesting codes cannot be used to get unlimited attempts.
export async function issueOtp(
  userId: string,
  purpose: OtpPurpose,
  repo: OtpRepository,
  now: Date = new Date(),
): Promise<IssueOtpResult> {
  const latest = await repo.findLatest(userId, purpose);
  if (latest) {
    const elapsedMs = now.getTime() - latest.createdAt.getTime();
    if (elapsedMs < OTP_COOLDOWN_MS) {
      return { issued: false, retryAfterSeconds: Math.ceil((OTP_COOLDOWN_MS - elapsedMs) / 1000) };
    }
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const codeHash = await hashPassword(code);
  await repo.create({ userId, purpose, codeHash, createdAt: now, expiresAt, consumedAt: null });
  return { issued: true, code };
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
    record.attempts >= OTP_MAX_ATTEMPTS
  ) {
    return rejectInvalid(code);
  }
  // Reserve the attempt BEFORE the slow hash check: the check above is only a
  // cheap early exit, this call is what enforces the limit under concurrency
  if (!(await repo.reserveAttempt(record.id, now))) {
    return rejectInvalid(code);
  }
  if (!(await verifyPassword(code, record.codeHash))) {
    return { success: false, reason: "invalid" };
  }
  if (!(await repo.consumeIfUnused(record.id, now))) {
    return { success: false, reason: "invalid" };
  }
  return { success: true };
}
