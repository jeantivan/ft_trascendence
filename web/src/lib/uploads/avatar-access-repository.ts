import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

// The two database questions behind "who can see whose avatar" (#23)
export interface AvatarAccessRepository {
  // Both have a Membership in the same club, with any role (Athlete or Manager)
  shareAClub(userId: string, otherId: string): Promise<boolean>;
  // Both are accepted Contacts, whatever the order of the ids
  areAcceptedContacts(userId: string, otherId: string): Promise<boolean>;
}

export class PrismaAvatarAccessRepository implements AvatarAccessRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async shareAClub(userId: string, otherId: string): Promise<boolean> {
    // A Membership of userId in a club that also has a Membership of otherId
    const shared = await this.db.membership.findFirst({
      where: { userId, organization: { memberships: { some: { userId: otherId } } } },
      select: { orgId: true },
    });
    return shared !== null;
  }

  async areAcceptedContacts(userId: string, otherId: string): Promise<boolean> {
    // The pair is stored ordered (user_a < user_b): asking both orders avoids
    // depending on how that order is computed
    const contact = await this.db.contact.findFirst({
      where: {
        status: "accepted",
        OR: [
          { userA: userId, userB: otherId },
          { userA: otherId, userB: userId },
        ],
      },
      select: { userA: true },
    });
    return contact !== null;
  }
}

export const avatarAccessRepository: AvatarAccessRepository = new PrismaAvatarAccessRepository();
