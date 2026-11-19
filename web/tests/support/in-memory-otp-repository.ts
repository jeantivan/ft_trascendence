import { randomUUID } from "node:crypto";
import type { OtpPurpose } from "@/generated/prisma/client";
import { OTP_MAX_ATTEMPTS, type OtpRecord, type OtpRepository } from "@/lib/gdpr/otp";

export class InMemoryOtpRepository implements OtpRepository {
  private records: OtpRecord[] = [];
  private locks = new Map<string, Promise<void>>();

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

  async findCreatedSince(userId: string, purpose: OtpPurpose, since: Date): Promise<OtpRecord[]> {
    return this.records
      .filter((r) => r.userId === userId && r.purpose === purpose && r.createdAt > since)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((r) => ({ ...r }));
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

  async withUserLock<T>(userId: string, fn: (repo: OtpRepository) => Promise<T>): Promise<T> {
    const previous = this.locks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(userId, current);
    await previous;
    try {
      return await fn(this);
    } finally {
      release();
      if (this.locks.get(userId) === current) {
        this.locks.delete(userId);
      }
    }
  }
}
