import { prisma } from "@/lib/prisma";
import type { OtpPurpose, Prisma, PrismaClient } from "@/generated/prisma/client";
import { OTP_MAX_ATTEMPTS, type OtpRecord, type OtpRepository } from "@/lib/gdpr/otp";

// The transaction client (tx) is accepted so consumeIfUnusedFor can run inside
// the same transaction as the operation the code authorizes
export class PrismaOtpRepository implements OtpRepository {
  constructor(private readonly db: PrismaClient | Prisma.TransactionClient = prisma) {}

  create(record: Omit<OtpRecord, "id" | "attempts">): Promise<OtpRecord> {
    return this.db.emailOtpCode.create({ data: record });
  }

  findLatest(userId: string, purpose: OtpPurpose): Promise<OtpRecord | null> {
    return this.db.emailOtpCode.findFirst({
      where: { userId, purpose },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  // One UPDATE with all the conditions in its WHERE: the database decides, so
  // two concurrent calls cannot both take the last attempt
  async reserveAttempt(recordId: string, now: Date): Promise<boolean> {
    const { count } = await this.db.emailOtpCode.updateMany({
      where: {
        id: recordId,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: OTP_MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    return count === 1;
  }

  async consumeIfUnused(recordId: string, now: Date): Promise<boolean> {
    const { count } = await this.db.emailOtpCode.updateMany({
      where: { id: recordId, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    return count === 1;
  }

  // userId and purpose are part of the same WHERE: the database decides in one write
  async consumeIfUnusedFor(recordId: string, userId: string, purpose: OtpPurpose, now: Date): Promise<boolean> {
    const { count } = await this.db.emailOtpCode.updateMany({
      where: { id: recordId, userId, purpose, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    return count === 1;
  }
}
