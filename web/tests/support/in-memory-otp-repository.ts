import { randomUUID } from "node:crypto";
import type { OtpPurpose } from "@/generated/prisma/client";
import type { OtpRecord, OtpRepository } from "@/lib/gdpr/otp";

export class InMemoryOtpRepository implements OtpRepository {
  private records: OtpRecord[] = [];

  async create(data: Omit<OtpRecord, "id">): Promise<OtpRecord> {
    const record = { ...data, id: randomUUID() };
    this.records.push(record);
    return record;
  }

  async findLatest(userId: string, purpose: OtpPurpose): Promise<OtpRecord | null> {
    const matches = this.records.filter((r) => r.userId === userId && r.purpose === purpose);
    return matches.at(-1) ?? null;
  }

  async consumeIfUnused(recordId: string, now: Date): Promise<boolean> {
    const record = this.records.find((r) => r.id === recordId);
    if (!record || record.consumedAt) return false;
    record.consumedAt = now;
    return true;
  }
}
