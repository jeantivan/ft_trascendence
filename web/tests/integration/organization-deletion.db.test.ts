// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordAdminAction } from "@/lib/gdpr/record-admin-action";
import { CLUB_WITHOUT_MANAGER, deleteAccountWithOtp } from "@/lib/gdpr/delete-account";
import {
  OrganizationDeletionAlreadyScheduledError,
  OrganizationDeletionNotScheduledError,
  PrismaOrganizationRepository,
} from "@/lib/org/organization-repository";
import { purgeExpiredOrganizations } from "@/lib/org/purge-expired-organizations";
import { issueDeleteCode } from "../support/delete-account-helper";

vi.mock("@/lib/gdpr/record-admin-action", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gdpr/record-admin-action")>();
  return { ...actual, recordAdminAction: vi.fn(actual.recordAdminAction) };
});

const PREFIX = "org-deletion-db-";
const repository = new PrismaOrganizationRepository(prisma);
const createdOrgIds: string[] = [];
let seq = 0;

async function createUser(roleGlobal: "user" | "admin" = "user"): Promise<{ id: string; email: string }> {
  const email = `${PREFIX}${seq++}@example.com`;
  const user = await prisma.user.create({ data: { email, roleGlobal } });
  return { id: user.id, email: user.email };
}

async function createClubWithMembers(opts: {
  managers?: string[];
  athletes?: string[];
  deleteAt?: Date | null;
} = {}): Promise<string> {
  const club = await prisma.organization.create({
    data: {
      name: `${PREFIX}club-${seq++}`,
      description: "Club de prueba",
      timezone: "Europe/Madrid",
      deleteAt: opts.deleteAt ?? null,
      memberships: {
        create: [
          ...(opts.managers ?? []).map((userId) => ({ userId, role: "manager" as const })),
          ...(opts.athletes ?? []).map((userId) => ({ userId, role: "athlete" as const })),
        ],
      },
    },
  });
  createdOrgIds.push(club.id);
  return club.id;
}

afterEach(async () => {
  vi.mocked(recordAdminAction).mockReset();
  // Clean up sessions/feedback first because TrainingSession.organization is onDelete: Restrict
  await prisma.feedback.deleteMany({
    where: { event: { orgId: { in: createdOrgIds } } },
  });
  await prisma.trainingSession.deleteMany({
    where: { orgId: { in: createdOrgIds } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: createdOrgIds } },
  });
  createdOrgIds.length = 0;

  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { subjectId: { in: userIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Organization deletion (Postgres)", () => {
  it("scheduleDeletion sets deleteAt +30d, revokes pending requests, notifies members and audits", async () => {
    const admin = await createUser("admin");
    const manager = await createUser();
    const athlete = await createUser();
    const pendingApplicant = await createUser();
    const acceptedApplicant = await createUser();

    const orgId = await createClubWithMembers({
      managers: [manager.id],
      athletes: [athlete.id],
    });
    await prisma.membershipRequest.createMany({
      data: [
        { orgId, userId: pendingApplicant.id, kind: "request", status: "pending" },
        { orgId, userId: acceptedApplicant.id, kind: "invite", status: "accepted" },
      ],
    });

    const now = new Date("2026-11-19T10:00:00.000Z");
    const result = await repository.scheduleDeletion(admin.id, orgId, now);

    const expectedDeleteAt = new Date("2026-12-19T10:00:00.000Z");
    expect(result.orgId).toBe(orgId);
    expect(result.deleteAt).toEqual(expectedDeleteAt);
    expect(result.memberEmails.sort()).toEqual([athlete.email, manager.email].sort());

    const club = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(club.deleteAt).toEqual(expectedDeleteAt);

    const requests = await prisma.membershipRequest.findMany({ where: { orgId } });
    expect(requests.find((r) => r.userId === pendingApplicant.id)?.status).toBe("revoked");
    expect(requests.find((r) => r.userId === acceptedApplicant.id)?.status).toBe("accepted");

    const notifications = await prisma.notification.findMany({
      where: { userId: { in: [manager.id, athlete.id] }, type: "organization_deletion_scheduled" },
    });
    expect(notifications).toHaveLength(2);

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: admin.id, action: "delete", resource: "organization", resourceId: orgId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.subjectId).toBeNull();

    await expect(repository.scheduleDeletion(admin.id, orgId, now)).rejects.toBeInstanceOf(
      OrganizationDeletionAlreadyScheduledError,
    );
  });

  it("scheduleDeletion rolls back if the audit write fails", async () => {
    const admin = await createUser("admin");
    const manager = await createUser();
    const orgId = await createClubWithMembers({ managers: [manager.id] });

    vi.mocked(recordAdminAction).mockRejectedValueOnce(new Error("audit down"));

    await expect(repository.scheduleDeletion(admin.id, orgId)).rejects.toThrow("audit down");

    const club = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(club.deleteAt).toBeNull();
    expect(await prisma.notification.count({ where: { userId: manager.id } })).toBe(0);
  });

  it("cancelDeletion clears deleteAt, notifies members and audits; rejects when inactive or expired", async () => {
    const admin = await createUser("admin");
    const manager = await createUser();
    const orgId = await createClubWithMembers({ managers: [manager.id] });
    const now = new Date("2026-11-19T10:00:00.000Z");

    await expect(repository.cancelDeletion(admin.id, orgId, now)).rejects.toBeInstanceOf(
      OrganizationDeletionNotScheduledError,
    );

    await repository.scheduleDeletion(admin.id, orgId, now);
    await repository.cancelDeletion(admin.id, orgId, new Date("2026-11-20T10:00:00.000Z"));

    const club = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    expect(club.deleteAt).toBeNull();

    const cancelNotes = await prisma.notification.findMany({
      where: { userId: manager.id, type: "organization_deletion_cancelled" },
    });
    expect(cancelNotes).toHaveLength(1);

    const audit = await prisma.auditLog.findFirst({
      where: { actorId: admin.id, action: "update", resource: "organization", resourceId: orgId },
    });
    expect(audit).not.toBeNull();

    // Expired club (deleteAt <= now) cannot be cancelled
    const expiredAt = new Date("2026-11-18T10:00:00.000Z");
    await prisma.organization.update({ where: { id: orgId }, data: { deleteAt: expiredAt } });
    await expect(repository.cancelDeletion(admin.id, orgId, now)).rejects.toBeInstanceOf(
      OrganizationDeletionNotScheduledError,
    );
  });

  it("blocks adding a new member via assignManager during notice, but allows promoting an existing athlete and never blocks account deletion", async () => {
    const admin = await createUser("admin");
    const manager = await createUser();
    const existingAthlete = await createUser();
    const outsider = await createUser();
    const orgId = await createClubWithMembers({
      managers: [manager.id],
      athletes: [existingAthlete.id],
    });

    await repository.scheduleDeletion(admin.id, orgId);

    // Non-member cannot join during notice
    await expect(repository.assignManager(admin.id, orgId, outsider.id)).rejects.toBeInstanceOf(
      OrganizationDeletionAlreadyScheduledError,
    );

    // Existing athlete can become Manager during notice
    await repository.assignManager(admin.id, orgId, existingAthlete.id);
    await expect(repository.listManagerIds(orgId)).resolves.toHaveLength(2);

    // Remove second manager so `manager` is the last Manager, then delete their account (GDPR art. 17)
    await repository.removeManager(admin.id, orgId, existingAthlete.id);
    const code = await issueDeleteCode(prisma, manager.id);
    const deleted = await deleteAccountWithOtp(manager.id, code, prisma);
    expect(deleted).toEqual({ deleted: true });

    const adminAlert = await prisma.notification.findFirst({
      where: { userId: admin.id, type: CLUB_WITHOUT_MANAGER },
    });
    expect(adminAlert).not.toBeNull();
  });

  it("purgeExpiredOrganizations removes expired clubs in order (Feedback -> TrainingSession -> Organization) and keeps user accounts", async () => {
    const now = new Date("2026-11-19T10:00:00.000Z");
    const past = new Date("2026-11-19T09:59:59.000Z");
    const future = new Date("2026-12-19T10:00:00.000Z");

    const manager = await createUser();
    const athlete = await createUser();
    const expiredOrgId = await createClubWithMembers({
      managers: [manager.id],
      athletes: [athlete.id],
      deleteAt: past,
    });
    const activeNoticeOrgId = await createClubWithMembers({
      managers: [manager.id],
      deleteAt: future,
    });
    const normalOrgId = await createClubWithMembers({
      managers: [manager.id],
      deleteAt: null,
    });

    const session = await prisma.trainingSession.create({
      data: {
        orgId: expiredOrgId,
        origin: "free",
        sessionType: "rodaje",
        scheduledAt: past,
        athleteId: athlete.id,
      },
    });
    await prisma.sessionLog.create({
      data: {
        sessionId: session.id,
        athleteId: athlete.id,
        completed: true,
        rpe: 6,
        performedAt: past,
      },
    });
    const event = await prisma.event.create({
      data: {
        orgId: expiredOrgId,
        title: "Rodaje grupal",
        location: "Retiro",
        startsAt: past,
        sessionId: session.id,
      },
    });
    const feedback = await prisma.feedback.create({
      data: {
        eventId: event.id,
        athleteId: athlete.id,
        managerId: manager.id,
        body: "Buen ritmo",
      },
    });

    const purgedCount = await purgeExpiredOrganizations(prisma, now);
    expect(purgedCount).toBe(1);

    expect(await prisma.organization.findUnique({ where: { id: expiredOrgId } })).toBeNull();
    expect(await prisma.feedback.findUnique({ where: { id: feedback.id } })).toBeNull();
    expect(await prisma.trainingSession.findUnique({ where: { id: session.id } })).toBeNull();
    expect(await prisma.sessionLog.count({ where: { sessionId: session.id } })).toBe(0);

    // Non-expired clubs and all user accounts remain untouched
    expect(await prisma.organization.findUnique({ where: { id: activeNoticeOrgId } })).not.toBeNull();
    expect(await prisma.organization.findUnique({ where: { id: normalOrgId } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: manager.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: athlete.id } })).not.toBeNull();
  });

  it("handles concurrent scheduleDeletion calls so only one wins and the other gets OrganizationDeletionAlreadyScheduledError", async () => {
    const admin = await createUser("admin");
    const manager = await createUser();
    const orgId = await createClubWithMembers({ managers: [manager.id] });

    const results = await Promise.allSettled([
      repository.scheduleDeletion(admin.id, orgId),
      repository.scheduleDeletion(admin.id, orgId),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(OrganizationDeletionAlreadyScheduledError);
  });
});
