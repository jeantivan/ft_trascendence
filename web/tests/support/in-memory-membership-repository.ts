import type { MembershipRole } from "@/generated/prisma/client";
import type { MembershipRepository } from "@/lib/permissions/membership-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InMemoryMembershipRepository implements MembershipRepository {
  private roles: Map<string, MembershipRole> = new Map();

  add(userId: string, orgId: string, role: MembershipRole): void {
    this.roles.set(`${userId}:${orgId}`, role);
  }

  async findRole(userId: string, orgId: string): Promise<MembershipRole | null> {
    // Like Prisma on a @db.Uuid column, which throws P2023 for a malformed id
    if (!UUID.test(userId) || !UUID.test(orgId)) {
      throw new Error("P2023: malformed UUID");
    }
    return this.roles.get(`${userId}:${orgId}`) ?? null;
  }
}
