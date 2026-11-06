import { prisma } from "@/lib/prisma";
import type { MembershipRole, PrismaClient } from "@/generated/prisma/client";

export interface MembershipRepository {
  // The user's role in that club, or null when they are not a member
  findRole(userId: string, orgId: string): Promise<MembershipRole | null>;
}

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findRole(userId: string, orgId: string): Promise<MembershipRole | null> {
    const membership = await this.db.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }
}

export const membershipRepository: MembershipRepository =
  new PrismaMembershipRepository();
