import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { recordAdminAction } from "@/lib/gdpr/record-admin-action";
import { normalizeId, type CreateOrganizationInput } from "./schemas";

// Two clubs cannot have the same name (exact match, case included)
export class OrganizationNameTakenError extends Error {
  constructor(message = "Organization name already taken") {
    super(message);
    this.name = "OrganizationNameTakenError";
  }
}

export class AlreadyManagerError extends Error {
  constructor(message = "The user is already a Manager of the club") {
    super(message);
    this.name = "AlreadyManagerError";
  }
}

export class NotManagerError extends Error {
  constructor(message = "The user is not a Manager of the club") {
    super(message);
    this.name = "NotManagerError";
  }
}

// An administrative removal cannot leave the club without a Manager
export class LastManagerError extends Error {
  constructor(message = "The club would be left without a Manager") {
    super(message);
    this.name = "LastManagerError";
  }
}

export class OrganizationNotFoundError extends Error {
  constructor(message = "Organization not found") {
    super(message);
    this.name = "OrganizationNotFoundError";
  }
}

export class UserNotFoundError extends Error {
  constructor(message = "The user does not exist") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

// What any signed-in user sees of a club in the catalog (matrix #2): no member
// list and nothing internal, only how many members there are.
export interface OrganizationSummary {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
}

// The club's own page, for its members and the Admin (organization.read)
export interface OrganizationDetail {
  id: string;
  name: string;
  description: string | null;
  // IANA zone, e.g. "Europe/Madrid"
  timezone: string;
}

// The fields of a club that its Manager can change
export type OrganizationEdit = Pick<OrganizationDetail, "description" | "timezone">;

export interface OrganizationRepository {
  // Every club, for the catalog
  listCatalog(): Promise<OrganizationSummary[]>;
  // The club's page, or null when it does not exist
  findById(orgId: string): Promise<OrganizationDetail | null>;
  // Changes what a Manager may edit; returns the new page, or null when the club does not exist
  update(orgId: string, data: OrganizationEdit): Promise<OrganizationDetail | null>;
  // Admin only: creates the club and makes each of managerIds its Manager, all or
  // nothing. adminId is who does it, for the audit rows written in the same transaction.
  createWithManagers(adminId: string, input: CreateOrganizationInput): Promise<OrganizationDetail>;
  // Admin only: makes the user a Manager of the club, joining it if not yet a member
  // (AlreadyManagerError if already Manager). UserNotFoundError if the user does not exist,
  // then OrganizationNotFoundError if the club does not; neither changes anything.
  // adminId is for the audit row.
  assignManager(adminId: string, orgId: string, userId: string): Promise<void>;
  // Admin only: the Manager stays in the club as an athlete. NotManagerError if the user
  // is not a Manager; LastManagerError if no other Manager would remain; UserNotFoundError
  // and OrganizationNotFoundError as in assignManager.
  removeManager(adminId: string, orgId: string, userId: string): Promise<void>;
  // The ids of the club's Managers
  listManagerIds(orgId: string): Promise<string[]>;
}

// Prisma errors carry a `code` (P2025, P2002...); checked structurally, like update does
function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === code;
}

// The unique index a P2002 violated: with the pg driver adapter Prisma reports it in
// meta.driverAdapterError.cause.constraint.index (checked against a real database in the
// integration tests). "" when the error does not say.
function violatedIndex(error: unknown): string {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { constraint?: { index?: unknown } } } } }).meta;
  const index = meta?.driverAdapterError?.cause?.constraint?.index;
  return typeof index === "string" ? index : "";
}

// True only when the violated unique constraint is organizations.name (exported for its test)
export function isNameViolation(error: unknown): boolean {
  return hasPrismaCode(error, "P2002") && violatedIndex(error) === "organizations_name_key";
}

// Locks every Manager's row, in id order so two creations cannot wait on each other, and checks
// they all exist. A concurrent account deletion (delete-account.ts locks the user first, too)
// then waits until this transaction ends, so the memberships below cannot hit a missing user:
// no P2003 has to be interpreted.
async function lockUsersExist(tx: Prisma.TransactionClient, userIds: string[]): Promise<void> {
  const users = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE id = ANY(${userIds}::uuid[]) ORDER BY id FOR UPDATE`;
  if (users.length !== userIds.length) throw new UserNotFoundError();
}

// Role changes lock the target user, then the club: the order account deletion uses
// (delete-account.ts), so the two cannot wait on each other. Whatever is read about the
// membership or the other Managers must be read after this, in a new statement.
async function lockUserThenClub(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
): Promise<void> {
  const users = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  if (users.length === 0) throw new UserNotFoundError();
  const clubs = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM organizations WHERE id = ${orgId}::uuid FOR UPDATE`;
  if (clubs.length === 0) throw new OrganizationNotFoundError();
}

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listCatalog(): Promise<OrganizationSummary[]> {
    const clubs = await this.db.organization.findMany({
      // select, not include: only these fields leave the database
      select: {
        id: true,
        name: true,
        description: true,
        // _count counts the rows in the database, the members are not read
        _count: { select: { memberships: true } },
      },
      orderBy: { name: "asc" },
    });
    return clubs.map(({ _count, ...club }) => ({
      ...club,
      memberCount: _count.memberships,
    }));
  }

  async findById(orgId: string): Promise<OrganizationDetail | null> {
    return this.db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, description: true, timezone: true },
    });
  }

  async createWithManagers(
    adminId: string,
    input: CreateOrganizationInput,
  ): Promise<OrganizationDetail> {
    // Same user in different capitalization is one user
    const managerIds = [...new Set(input.managerIds.map(normalizeId))];
    try {
      // One transaction: if any write fails, the club, its memberships and the
      // audit rows are all rolled back
      return await this.db.$transaction(async (tx) => {
        await lockUsersExist(tx, managerIds);
        const club = await tx.organization.create({
          data: {
            name: input.name,
            description: input.description,
            timezone: input.timezone,
            memberships: {
              create: managerIds.map((userId) => ({ userId, role: "manager" as const })),
            },
          },
          select: { id: true, name: true, description: true, timezone: true },
        });
        await recordAdminAction(tx, {
          adminId,
          action: "create",
          resource: "organization",
          resourceId: club.id,
        });
        for (const managerId of managerIds) {
          await recordAdminAction(tx, {
            adminId,
            action: "role_change",
            resource: "membership",
            subjectId: managerId,
            resourceId: club.id,
          });
        }
        return club;
      });
    } catch (error) {
      // Only a violation of organizations.name means "name taken"; any other
      // constraint is not translated
      if (isNameViolation(error)) {
        throw new OrganizationNameTakenError();
      }
      throw error;
    }
  }

  async assignManager(adminId: string, orgId: string, userId: string): Promise<void> {
    orgId = normalizeId(orgId);
    userId = normalizeId(userId);
    await this.db.$transaction(
      async (tx) => {
        await lockUserThenClub(tx, orgId, userId);
        const membership = await tx.membership.findUnique({
          where: { userId_orgId: { userId, orgId } },
          select: { role: true },
        });
        if (membership?.role === "manager") throw new AlreadyManagerError();
        await tx.membership.upsert({
          where: { userId_orgId: { userId, orgId } },
          update: { role: "manager" },
          create: { userId, orgId, role: "manager" },
        });
        await recordAdminAction(tx, {
          adminId,
          action: "role_change",
          resource: "membership",
          subjectId: userId,
          resourceId: orgId,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async removeManager(adminId: string, orgId: string, userId: string): Promise<void> {
    orgId = normalizeId(orgId);
    userId = normalizeId(userId);
    await this.db.$transaction(
      async (tx) => {
        await lockUserThenClub(tx, orgId, userId);
        const membership = await tx.membership.findUnique({
          where: { userId_orgId: { userId, orgId } },
          select: { role: true },
        });
        if (membership?.role !== "manager") throw new NotManagerError();
        const otherManagers = await tx.membership.count({
          where: { orgId, role: "manager", userId: { not: userId } },
        });
        if (otherManagers === 0) throw new LastManagerError();
        await tx.membership.update({
          where: { userId_orgId: { userId, orgId } },
          data: { role: "athlete" },
        });
        await recordAdminAction(tx, {
          adminId,
          action: "role_change",
          resource: "membership",
          subjectId: userId,
          resourceId: orgId,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async listManagerIds(orgId: string): Promise<string[]> {
    const managers = await this.db.membership.findMany({
      where: { orgId, role: "manager" },
      select: { userId: true },
    });
    return managers.map((manager) => manager.userId);
  }

  async update(orgId: string, data: OrganizationEdit): Promise<OrganizationDetail | null> {
    try {
      return await this.db.organization.update({
        where: { id: orgId },
        data: { description: data.description, timezone: data.timezone },
        select: { id: true, name: true, description: true, timezone: true },
      });
    } catch (error) {
      // P2025: the row to update does not exist
      if (hasPrismaCode(error, "P2025")) {
        return null;
      }
      throw error;
    }
  }
}

export const organizationRepository: OrganizationRepository =
  new PrismaOrganizationRepository();
