import { prisma } from "@/lib/prisma";
import type { MembershipRole, PrismaClient } from "@/generated/prisma/client";

export interface MembershipRepository {
  // The user's role in that club, or null when they are not a member
  findRole(userId: string, orgId: string): Promise<MembershipRole | null>;
  // Whether the club exists: an Admin who is not a member has no membership to prove it
  organizationExists(orgId: string): Promise<boolean>;
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

  async organizationExists(orgId: string): Promise<boolean> {
    // count, not findUnique: only whether it exists, no club data is read
    return (await this.db.organization.count({ where: { id: orgId } })) > 0;
  }
}

export const membershipRepository: MembershipRepository =
  new PrismaMembershipRepository();
