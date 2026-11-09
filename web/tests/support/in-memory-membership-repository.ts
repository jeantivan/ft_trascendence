import type { MembershipRole } from "@/generated/prisma/client";
import type { MembershipRepository } from "@/lib/permissions/membership-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Like Prisma on a @db.Uuid column, which throws P2023 for a malformed id
function assertUuid(...ids: string[]): void {
  if (ids.some((id) => !UUID.test(id))) {
    throw new Error("P2023: malformed UUID");
  }
}

export class InMemoryMembershipRepository implements MembershipRepository {
  private roles: Map<string, MembershipRole> = new Map();
  private organizations: Set<string> = new Set();

  // A membership can only point to an existing club (foreign key), so it adds the club too
  add(userId: string, orgId: string, role: MembershipRole): void {
    this.roles.set(`${userId}:${orgId}`, role);
    this.organizations.add(orgId);
  }

  // A club with no members yet (or none of the users in the test)
  addOrganization(orgId: string): void {
    this.organizations.add(orgId);
  }

  async findRole(userId: string, orgId: string): Promise<MembershipRole | null> {
    assertUuid(userId, orgId);
    return this.roles.get(`${userId}:${orgId}`) ?? null;
  }

  async organizationExists(orgId: string): Promise<boolean> {
    assertUuid(orgId);
    return this.organizations.has(orgId);
  }
}
