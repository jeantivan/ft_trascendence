// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PrismaMembershipRepository } from "@/lib/permissions/membership-repository";

const PREFIX = "membership-repository-";
// A valid id that no club in the test database has
const MISSING_CLUB = "6f1c2a4e-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const repository = new PrismaMembershipRepository(prisma);

function createClub(name: string) {
  return prisma.organization.create({
    data: { name: `${PREFIX}${name}`, timezone: "Europe/Madrid" },
  });
}

describe("Integration: PrismaMembershipRepository", () => {
  let userId: string;
  let orgId: string;

  beforeEach(async () => {
    const user = await prisma.user.create({ data: { email: `${PREFIX}user@example.com` } });
    const club = await createClub("club");
    userId = user.id;
    orgId = club.id;
  });
  afterEach(async () => {
    // Deleting the users and clubs also deletes their memberships (onDelete: Cascade)
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await prisma.organization.deleteMany({ where: { name: { startsWith: PREFIX } } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(["manager", "athlete"] as const)("returns the %s role of a member", async (role) => {
    await prisma.membership.create({ data: { userId, orgId, role } });

    await expect(repository.findRole(userId, orgId)).resolves.toBe(role);
  });

  it("returns null when the user is not a member of any club", async () => {
    await expect(repository.findRole(userId, orgId)).resolves.toBeNull();
  });

  it("returns null when the user is only a member of another club", async () => {
    const otherClub = await createClub("other-club");
    await prisma.membership.create({ data: { userId, orgId: otherClub.id, role: "manager" } });

    await expect(repository.findRole(userId, orgId)).resolves.toBeNull();
  });

  it("says a club exists when it is in the database", async () => {
    await expect(repository.organizationExists(orgId)).resolves.toBe(true);
  });

  it("says a club does not exist when no club has that id", async () => {
    await expect(repository.organizationExists(MISSING_CLUB)).resolves.toBe(false);
  });
});
