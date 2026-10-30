import type { OtpPurpose } from "@/generated/prisma/client";
import type { OtpRecord, OtpRepository } from "@/lib/gdpr/otp";

export class InMemoryOtpRepository implements OtpRepository {
  private records: OtpRecord[] = [];

  async create(record: OtpRecord): Promise<void> {
    this.records.push(record);
  }

  async findLatest(userId: string, purpose: OtpPurpose): Promise<OtpRecord | null> {
    const matches = this.records.filter((r) => r.userId === userId && r.purpose === purpose);
    return matches.at(-1) ?? null;
  }
}
