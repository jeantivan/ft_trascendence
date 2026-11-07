import { randomUUID } from "node:crypto";
import type { OtpPurpose } from "@/generated/prisma/client";
import { OTP_MAX_ATTEMPTS, type OtpRecord, type OtpRepository } from "@/lib/gdpr/otp";

export class InMemoryOtpRepository implements OtpRepository {
  private records: OtpRecord[] = [];

  async create(data: Omit<OtpRecord, "id" | "attempts">): Promise<OtpRecord> {
    const record = { ...data, id: randomUUID(), attempts: 0 };
    this.records.push(record);
    return { ...record };
  }

  async findLatest(userId: string, purpose: OtpPurpose): Promise<OtpRecord | null> {
    const matches = this.records.filter((r) => r.userId === userId && r.purpose === purpose);
    let latest: OtpRecord | null = null;
    for (const r of matches) {
      if (
        !latest ||
        r.createdAt > latest.createdAt ||
        (r.createdAt.getTime() === latest.createdAt.getTime() && r.id > latest.id)
      ) {
        latest = r;
      }
    }
    // Copy, like a database row: callers must not hold a live reference
    return latest ? { ...latest } : null;
  }

  async reserveAttempt(recordId: string, now: Date): Promise<boolean> {
    const record = this.records.find((r) => r.id === recordId);
    if (!record || record.consumedAt || now >= record.expiresAt) return false;
    if (record.attempts >= OTP_MAX_ATTEMPTS) return false;
    record.attempts += 1;
    return true;
  }

  async consumeIfUnused(recordId: string, now: Date): Promise<boolean> {
    const record = this.records.find((r) => r.id === recordId);
    if (!record || record.consumedAt) return false;
    if (now >= record.expiresAt) return false;
    record.consumedAt = now;
    return true;
  }

  async consumeIfUnusedFor(recordId: string, userId: string, purpose: OtpPurpose, now: Date): Promise<boolean> {
    const record = this.records.find((r) => r.id === recordId);
    if (!record || record.userId !== userId || record.purpose !== purpose) return false;
    return this.consumeIfUnused(recordId, now);
  }
}
