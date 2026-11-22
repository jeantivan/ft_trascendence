import { prisma } from "@/lib/prisma";
import {
  Prisma,
  type MembershipRequestKind,
  type MembershipRequestStatus,
  type PrismaClient,
} from "@/generated/prisma/client";
import { recordAdminAction } from "@/lib/gdpr/record-admin-action";
import { notify } from "@/lib/notifications/notify";
import {
  ORGANIZATION_DELETION_CANCELLED,
  ORGANIZATION_DELETION_SCHEDULED,
} from "./club-deletion-notifier";
import { normalizeId, type CreateOrganizationInput } from "./schemas";
import {
  MEMBERSHIP_ACCEPTED,
  MEMBERSHIP_INVITATION_CREATED,
  MEMBERSHIP_REQUEST_CREATED,
  type Notify,
} from "./membership-notifier";
import { notify as realNotify } from "@/lib/notifications/notify";

// Two clubs cannot have the same name (exact match, case included)
export class OrganizationNameTakenError extends Error {
  constructor(message = "Organization name already taken") {
    super(message);
    this.name = "OrganizationNameTakenError";
  }
}

// No Admin account can be Manager of a club, not the Admin acting nor any other: the Admin
// is not a role with access to personal data (matrix #2) and a Manager reads RPE and Feedback
export class AdminCannotBeManagerError extends Error {
  constructor(message = "No Admin account can be Manager of a club") {
    super(message);
    this.name = "AdminCannotBeManagerError";
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

export class OrganizationDeletionAlreadyScheduledError extends Error {
  constructor(message = "Organization deletion is already scheduled") {
    super(message);
    this.name = "OrganizationDeletionAlreadyScheduledError";
  }
}

export class OrganizationDeletionNotScheduledError extends Error {
  constructor(message = "Organization has no active scheduled deletion") {
    super(message);
    this.name = "OrganizationDeletionNotScheduledError";
  }
}

export class UserNotFoundError extends Error {
  constructor(message = "The user does not exist") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

// The user already belongs to the club
export class AlreadyMemberError extends Error {
  constructor(message = "The user is already a member of the club") {
    super(message);
    this.name = "AlreadyMemberError";
  }
}

// One pending invitation or request per user and club, whichever the kind
export class RequestAlreadyPendingError extends Error {
  constructor(message = "The user already has a pending request or invitation in the club") {
    super(message);
    this.name = "RequestAlreadyPendingError";
  }
}

// The request does not exist, or it is not the caller's to decide (another club, another user,
// another kind): the same answer for both, so ids cannot be probed
export class MembershipRequestNotFoundError extends Error {
  constructor(message = "Membership request not found") {
    super(message);
    this.name = "MembershipRequestNotFoundError";
  }
}

// Someone decided it first (409)
export class MembershipRequestNotPendingError extends Error {
  constructor(message = "The membership request is no longer pending") {
    super(message);
    this.name = "MembershipRequestNotPendingError";
  }
}

// What any signed-in user sees of a club in the catalog (matrix #2): no member
// list and nothing internal, only how many members there are.
export interface OrganizationSummary {
  id: string;
  name: string;
  description: string | null;
  deleteAt: Date | null;
  memberCount: number;
}

// The club's own page, for its members and the Admin (organization.read)
export interface OrganizationDetail {
  id: string;
  name: string;
  description: string | null;
  // IANA zone, e.g. "Europe/Madrid"
  timezone: string;
  deleteAt: Date | null;
}

export interface ScheduleDeletionResult {
  orgId: string;
  orgName: string;
  deleteAt: Date;
  memberEmails: string[];
}

// The fields of a club that its Manager can change
export type OrganizationEdit = Pick<OrganizationDetail, "description" | "timezone">;

// An invitation from a Manager (kind "invite") or a request from the user (kind "request")
export interface MembershipRequestDetail {
  id: string;
  orgId: string;
  userId: string;
  kind: MembershipRequestKind;
  status: MembershipRequestStatus;
  // Who created it; null if that account was deleted
  createdBy: string | null;
  createdAt: Date;
}

export interface OrganizationRepository {
  // Every club, for the catalog
  listCatalog(): Promise<OrganizationSummary[]>;
  // The club's page, or null when it does not exist
  findById(orgId: string): Promise<OrganizationDetail | null>;
  // Changes what a Manager may edit; returns the new page, or null when the club does not exist
  update(orgId: string, data: OrganizationEdit): Promise<OrganizationDetail | null>;
  // Admin only: creates the club and makes each of managerIds its Manager, all or
  // nothing (UserNotFoundError if one does not exist, then AdminCannotBeManagerError if one
  // is an Admin account; neither creates anything). adminId is who does it, for the audit rows written in the same transaction.
  // Known limit: a blocked account (users.blocked_at) is accepted as Manager, and
  // removeManager counts a blocked Manager as "another Manager". #148 says "otro Manager activo",
  // which Marta reads as excluding blocked Managers (15-nov); not implemented because the
  // condition is complex and the 42 demo does not reach it.
  // Known limit: "a club has at least one Manager" is enforced by createOrganizationSchema
  // (min 1 managerId), not here: a caller that skips the schema could create a club with none.
  createWithManagers(adminId: string, input: CreateOrganizationInput): Promise<OrganizationDetail>;
  // Admin only: makes the user a Manager of the club, joining it if not yet a member
  // (AlreadyManagerError if already Manager). UserNotFoundError if the user does not exist,
  // then OrganizationNotFoundError if the club does not, then AdminCannotBeManagerError if the
  // user is an Admin account; none changes anything.
  // adminId is for the audit row.
  assignManager(adminId: string, orgId: string, userId: string): Promise<void>;
  // Admin only: the Manager stays in the club as an athlete. NotManagerError if the user
  // is not a Manager; LastManagerError if no other Manager would remain; UserNotFoundError
  // and OrganizationNotFoundError as in assignManager.
  removeManager(adminId: string, orgId: string, userId: string): Promise<void>;
  // The ids of the club's Managers
  listManagerIds(orgId: string): Promise<string[]>;
  // Admin only: schedules club deletion in 30 days, revokes pending requests, notifies members and audits
  scheduleDeletion(adminId: string, orgId: string, now?: Date): Promise<ScheduleDeletionResult>;
  // Admin only: cancels an active scheduled deletion (deleteAt > now), notifies members and audits
  cancelDeletion(adminId: string, orgId: string, now?: Date): Promise<void>;
  // Manager only (invitation.manage): managerId is who invites, for createdBy. UserNotFoundError if
  // the user does not exist or is blocked (the same answer, so a blocked account is not revealed),
  // then OrganizationNotFoundError, AlreadyMemberError, RequestAlreadyPendingError; none creates anything.
  // Known limit: an Admin account can be invited and joins as athlete; no demo flow does it.
  // Known limit: a Manager can invite again whoever rejected or was revoked, with no limit.
  // Notifies the invitee.
  inviteUser(managerId: string, orgId: string, userId: string): Promise<MembershipRequestDetail>;
  // Any signed-in user who is not a member asks to join. Same errors as inviteUser.
  // Known limit: an Admin account can ask and, once approved, joins as athlete (same as inviteUser).
  // Notifies the club's Managers. Known limit: a club without Managers leaves it pending until
  // the Admin names one.
  requestToJoin(userId: string, orgId: string): Promise<MembershipRequestDetail>;
  // Manager only: the club's pending invitation becomes revoked, no notification.
  // MembershipRequestNotFoundError, then MembershipRequestNotPendingError if already decided.
  revokeInvitation(orgId: string, requestId: string): Promise<void>;
  // The user withdraws their own pending request (revoked, no notification). Same errors.
  withdrawRequest(userId: string, requestId: string): Promise<void>;
  // The invited user accepts (becomes athlete of the club, in the same transaction, and the
  // Manager who invited is notified) or rejects (no notification). Same errors, and
  // AlreadyMemberError if they joined meanwhile (the invitation stays pending).
  answerInvitation(userId: string, requestId: string, accept: boolean): Promise<void>;
  // Manager only (membershipRequest.review): approve (the user becomes athlete of the club and is
  // notified) or reject (no notification). Same errors as answerInvitation. Of two decisions at
  // once only one wins; the other gets MembershipRequestNotPendingError.
  reviewRequest(orgId: string, requestId: string, approve: boolean): Promise<void>;
  // The club's pending requests (kind "request"), oldest first
  listPendingRequests(orgId: string): Promise<MembershipRequestDetail[]>;
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
// they all exist and none is an Admin account (read under the lock, so it cannot change meanwhile). A concurrent account deletion (delete-account.ts locks the user first, too)
// then waits until this transaction ends, so the memberships below cannot hit a missing user:
// no P2003 has to be interpreted. FOR NO KEY UPDATE, not FOR UPDATE: it still conflicts with the
// deletion's FOR UPDATE, but not with the KEY SHARE that a foreign key check takes (see
// lockUserThenClub).
async function lockUsersExist(tx: Prisma.TransactionClient, userIds: string[]): Promise<void> {
  const users = await tx.$queryRaw<{ id: string; is_admin: boolean }[]>`
    SELECT id, role_global = 'admin' AS is_admin FROM users
    WHERE id = ANY(${userIds}::uuid[]) ORDER BY id FOR NO KEY UPDATE`;
  if (users.length !== userIds.length) throw new UserNotFoundError();
  if (users.some((user) => user.is_admin)) throw new AdminCannotBeManagerError();
}

export const DELETION_NOTICE_DAYS = 30;
export const DAY_MS = 24 * 60 * 60 * 1000;

// Scheduling or cancelling a deletion notifies every member, and each notification's foreign key
// needs a KEY SHARE lock on the member's row. A concurrent account deletion holds that row FOR
// UPDATE and then waits for the club, so taking the club first here ends in a deadlock (40P01).
// So the members' rows go first, in id order, then the club (the same order as lockUserThenClub).
// FOR NO KEY UPDATE for the reason given there.
// Known limit: someone who joins between this read and the club lock is not locked; if that user
// deletes their account at that very moment the deadlock can still happen.
async function lockMemberUsers(tx: Prisma.TransactionClient, orgId: string): Promise<void> {
  const members = await tx.membership.findMany({ where: { orgId }, select: { userId: true } });
  if (members.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM users WHERE id = ANY(${members.map((m) => m.userId)}::uuid[])
    ORDER BY id FOR NO KEY UPDATE`;
}

async function lockOrganization(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<{ id: string; name: string; delete_at: Date | null }> {
  const clubs = await tx.$queryRaw<{ id: string; name: string; delete_at: Date | null }[]>`
    SELECT id, name, delete_at FROM organizations WHERE id = ${orgId}::uuid FOR UPDATE`;
  if (clubs.length === 0) throw new OrganizationNotFoundError();
  return clubs[0];
}

// Role changes lock the target user, then the club: the order account deletion uses
// (delete-account.ts), so the two cannot wait on each other. Whatever is read about the
// membership or the other Managers must be read after this, in a new statement.
// The user row is taken FOR NO KEY UPDATE, not FOR UPDATE: deleting the last Manager of a club
// notifies every Admin, and the notification's foreign key needs a KEY SHARE lock on the Admin's
// row. With FOR UPDATE, an Admin being assigned here (rejected only after its row is locked: row held, waiting for the club the deletion
// already holds) and that deletion would wait for each other (40P01). FOR NO KEY UPDATE does not
// conflict with KEY SHARE, and still conflicts with the FOR UPDATE of the user's own deletion.
// Returns whether the user is an Admin account, read under the lock.
async function lockUserThenClub(
  tx: Prisma.TransactionClient,
  orgId: string,
  userId: string,
): Promise<{ isAdmin: boolean; clubDeleteAt: Date | null }> {
  const users = await tx.$queryRaw<{ is_admin: boolean }[]>`
    SELECT role_global = 'admin' AS is_admin FROM users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
  if (users.length === 0) throw new UserNotFoundError();
  const club = await lockOrganization(tx, orgId);
  return { isAdmin: users[0].is_admin, clubDeleteAt: club.delete_at };
}

// The partial unique index on (org_id, user_id) WHERE status = 'pending' (exported for its test)
// Known limit: it exists only in the migration SQL, not in schema.prisma (Prisma cannot express
// it), so `migrate dev` may report drift and propose dropping it: never accept that.
export const PENDING_REQUEST_INDEX = "membership_requests_org_user_pending_key";

export function isPendingViolation(error: unknown): boolean {
  return hasPrismaCode(error, "P2002") && violatedIndex(error) === PENDING_REQUEST_INDEX;
}

// The user must exist and not be blocked; blocked reads like missing (same criterion as login)
async function assertUserCanJoin(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { blockedAt: true } });
  if (!user || user.blockedAt) throw new UserNotFoundError();
}

export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly notify: Notify = realNotify,
  ) {}

  async listCatalog(): Promise<OrganizationSummary[]> {
    const clubs = await this.db.organization.findMany({
      // select, not include: only these fields leave the database
      select: {
        id: true,
        name: true,
        description: true,
        deleteAt: true,
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
      select: { id: true, name: true, description: true, timezone: true, deleteAt: true },
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
          select: { id: true, name: true, description: true, timezone: true, deleteAt: true },
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
        const { isAdmin, clubDeleteAt } = await lockUserThenClub(tx, orgId, userId);
        if (isAdmin) throw new AdminCannotBeManagerError();
        const membership = await tx.membership.findUnique({
          where: { userId_orgId: { userId, orgId } },
          select: { role: true },
        });
        if (membership?.role === "manager") throw new AlreadyManagerError();
        // Existing members can still become Managers during the 30-day notice,
        // but no new members can join while deletion is scheduled (#217)
        if (!membership && clubDeleteAt !== null) {
          throw new OrganizationDeletionAlreadyScheduledError();
        }
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

  async inviteUser(managerId: string, orgId: string, userId: string): Promise<MembershipRequestDetail> {
    return this.createRequest(normalizeId(managerId), normalizeId(orgId), normalizeId(userId), "invite");
  }

  async requestToJoin(userId: string, orgId: string): Promise<MembershipRequestDetail> {
    userId = normalizeId(userId);
    return this.createRequest(userId, normalizeId(orgId), userId, "request");
  }

  // Shared by both kinds. The user is checked first, then the club, like assignManager. The pending
  // check gives the friendly error; the partial unique index is what holds under concurrency
  private async createRequest(
    creatorId: string,
    orgId: string,
    userId: string,
    kind: "invite" | "request",
  ): Promise<MembershipRequestDetail> {
    try {
      return await this.db.$transaction(
        async (tx) => {
          await assertUserCanJoin(tx, userId);
          const club = await tx.organization.findUnique({ where: { id: orgId }, select: { deleteAt: true } });
          if (!club) throw new OrganizationNotFoundError();
          // Known limit: deleteAt is read without locking the club. Locking it here and then
          // notifying the Managers (KEY SHARE on their user rows) is the organizations -> users
          // order that deadlocks with account deletion. A request created in the instant
          // scheduleDeletion commits survives its revocation; the purge removes it with the club
          if (club.deleteAt !== null) throw new OrganizationDeletionAlreadyScheduledError();
          const member = await tx.membership.findUnique({
            where: { userId_orgId: { userId, orgId } },
            select: { userId: true },
          });
          if (member) throw new AlreadyMemberError();
          const pending = await tx.membershipRequest.findFirst({
            where: { orgId, userId, status: "pending" },
            select: { id: true },
          });
          if (pending) throw new RequestAlreadyPendingError();
          const request = await tx.membershipRequest.create({
            data: { orgId, userId, kind, createdBy: creatorId },
          });
          const payload = { orgId, requestId: request.id };
          if (kind === "invite") {
            await this.notify(tx, { userId, type: MEMBERSHIP_INVITATION_CREATED, payload });
          } else {
            const managers = await tx.membership.findMany({
              where: { orgId, role: "manager" },
              select: { userId: true },
            });
            for (const manager of managers) {
              await this.notify(tx, { userId: manager.userId, type: MEMBERSHIP_REQUEST_CREATED, payload });
            }
          }
          return request;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (isPendingViolation(error)) throw new RequestAlreadyPendingError();
      throw error;
    }
  }

  // Pending -> status, only if still pending: of two decisions at once one updates the row and
  // the other finds count 0. `where` carries who may decide it (club, user, kind).
  private async decide(
    tx: Prisma.TransactionClient,
    where: Prisma.MembershipRequestWhereInput,
    status: "accepted" | "rejected" | "revoked",
  ): Promise<MembershipRequestDetail> {
    const { count } = await tx.membershipRequest.updateMany({
      where: { ...where, status: "pending" },
      data: { status },
    });
    const request = await tx.membershipRequest.findFirst({ where });
    if (!request) throw new MembershipRequestNotFoundError();
    if (count === 0) throw new MembershipRequestNotPendingError();
    return request;
  }

  // The user joins as athlete, in the transaction that accepted the request. Checked again here:
  // a user blocked after the request was created must not get in.
  // Known limit: the user and the club are not locked (lockUserThenClub), so a concurrent account
  // deletion can end in a deadlock or an unmapped foreign key error (500); chained race (#238).
  // Known limit: the find-then-create below is not atomic: if assignManager adds the same user to
  // the club in between, create fails with an unhandled P2002 (500).
  // Known limit: if the Admin makes the user Manager while a request is pending, approving it
  // throws AlreadyMemberError and it stays pending until a Manager rejects or revokes it.
  private async join(tx: Prisma.TransactionClient, request: MembershipRequestDetail): Promise<void> {
    const { userId, orgId } = request;
    await assertUserCanJoin(tx, userId);
    const member = await tx.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { userId: true },
    });
    if (member) throw new AlreadyMemberError();
    await tx.membership.create({ data: { userId, orgId, role: "athlete" } });
  }

  async revokeInvitation(orgId: string, requestId: string): Promise<void> {
    const where = { id: normalizeId(requestId), orgId: normalizeId(orgId), kind: "invite" } as const;
    await this.db.$transaction((tx) => this.decide(tx, where, "revoked"));
  }

  async withdrawRequest(userId: string, requestId: string): Promise<void> {
    const where = { id: normalizeId(requestId), userId: normalizeId(userId), kind: "request" } as const;
    await this.db.$transaction((tx) => this.decide(tx, where, "revoked"));
  }

  async answerInvitation(userId: string, requestId: string, accept: boolean): Promise<void> {
    const where = { id: normalizeId(requestId), userId: normalizeId(userId), kind: "invite" } as const;
    await this.db.$transaction(
      async (tx) => {
        const request = await this.decide(tx, where, accept ? "accepted" : "rejected");
        if (!accept) return;
        await this.join(tx, request);
        // The Manager who invited; null if that account is gone.
        // Known limit: it goes to that Manager even if they no longer are one.
        if (request.createdBy) {
          await this.notify(tx, {
            userId: request.createdBy,
            type: MEMBERSHIP_ACCEPTED,
            payload: { orgId: request.orgId, requestId: request.id, userId: request.userId },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async reviewRequest(orgId: string, requestId: string, approve: boolean): Promise<void> {
    const where = { id: normalizeId(requestId), orgId: normalizeId(orgId), kind: "request" } as const;
    await this.db.$transaction(
      async (tx) => {
        const request = await this.decide(tx, where, approve ? "accepted" : "rejected");
        if (!approve) return;
        await this.join(tx, request);
        await this.notify(tx, {
          userId: request.userId,
          type: MEMBERSHIP_ACCEPTED,
          payload: { orgId: request.orgId, requestId: request.id, userId: request.userId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async listPendingRequests(orgId: string): Promise<MembershipRequestDetail[]> {
    return this.db.membershipRequest.findMany({
      where: { orgId: normalizeId(orgId), kind: "request", status: "pending" },
      orderBy: { createdAt: "asc" },
    });
  }

  async update(orgId: string, data: OrganizationEdit): Promise<OrganizationDetail | null> {
    try {
      return await this.db.organization.update({
        where: { id: orgId },
        data: { description: data.description, timezone: data.timezone },
        select: { id: true, name: true, description: true, timezone: true, deleteAt: true },
      });
    } catch (error) {
      // P2025: the row to update does not exist
      if (hasPrismaCode(error, "P2025")) {
        return null;
      }
      throw error;
    }
  }

  async scheduleDeletion(
    adminId: string,
    orgId: string,
    now: Date = new Date(),
  ): Promise<ScheduleDeletionResult> {
    orgId = normalizeId(orgId);
    return this.db.$transaction(
      async (tx) => {
        await lockMemberUsers(tx, orgId);
        const club = await lockOrganization(tx, orgId);
        if (club.delete_at !== null) {
          throw new OrganizationDeletionAlreadyScheduledError();
        }
        const deleteAt = new Date(now.getTime() + DELETION_NOTICE_DAYS * DAY_MS);
        await tx.organization.update({
          where: { id: orgId },
          data: { deleteAt },
        });
        await tx.membershipRequest.updateMany({
          where: { orgId, status: "pending" },
          data: { status: "revoked" },
        });
        const members = await tx.membership.findMany({
          where: { orgId },
          select: { userId: true, user: { select: { email: true } } },
        });
        // The payload only carries ids: the date goes by email and is read from the club
        for (const member of members) {
          await notify(tx, {
            userId: member.userId,
            type: ORGANIZATION_DELETION_SCHEDULED,
            payload: { orgId },
          });
        }
        await recordAdminAction(tx, {
          adminId,
          action: "delete",
          resource: "organization",
          resourceId: orgId,
        });
        return {
          orgId,
          orgName: club.name,
          deleteAt,
          memberEmails: members.map((member) => member.user.email),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async cancelDeletion(
    adminId: string,
    orgId: string,
    now: Date = new Date(),
  ): Promise<void> {
    orgId = normalizeId(orgId);
    await this.db.$transaction(
      async (tx) => {
        await lockMemberUsers(tx, orgId);
        const club = await lockOrganization(tx, orgId);
        if (club.delete_at === null || club.delete_at <= now) {
          throw new OrganizationDeletionNotScheduledError();
        }
        await tx.organization.update({
          where: { id: orgId },
          data: { deleteAt: null },
        });
        const members = await tx.membership.findMany({
          where: { orgId },
          select: { userId: true },
        });
        for (const member of members) {
          await notify(tx, {
            userId: member.userId,
            type: ORGANIZATION_DELETION_CANCELLED,
            payload: { orgId },
          });
        }
        await recordAdminAction(tx, {
          adminId,
          action: "update",
          resource: "organization",
          resourceId: orgId,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }
}

export const organizationRepository: OrganizationRepository =
  new PrismaOrganizationRepository();
