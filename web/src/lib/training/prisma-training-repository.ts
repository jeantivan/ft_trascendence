import { prisma } from "@/lib/prisma";
import { isDbId } from "@/lib/permissions/is-db-id";
import { normalizeId } from "@/lib/org/schemas";
import { computeScheduledAtUtc } from "@/lib/training/units";
import type {
  Prisma,
  PrismaClient,
  MembershipRole,
  SessionType,
} from "@/generated/prisma/client";
import { isDuplicateTemplateAssignment } from "./duplicate-assignment";
import { TrainingConflictError, TrainingNotFoundError } from "./errors";
import { excludeSubstitutedGroupSessions } from "./schedule";
import type {
  AssignTrainingTemplateInput,
  CreateTrainingTemplateInput,
  TrainingAssignCallback,
  TrainingMutationCallback,
  TrainingRepository,
  TrainingSessionData,
  TrainingTemplateData,
  UpdateTrainingTemplateInput,
} from "./types";

type PrismaTemplateWithSessions = {
  id: string;
  orgId: string;
  name: string;
  createdBy: string | null;
  sessions: Array<{
    sessionType: SessionType;
    dayOffset: number;
    position: number;
    targetDistanceM: number | null;
    targetDurationS: number | null;
    targetPaceSPerKm: number | null;
  }>;
};

function toTemplateData(template: PrismaTemplateWithSessions): TrainingTemplateData {
  return {
    id: template.id,
    orgId: template.orgId,
    name: template.name,
    createdBy: template.createdBy,
    sessions: template.sessions.map((s) => ({
      sessionType: s.sessionType,
      dayOffset: s.dayOffset,
      position: s.position,
      targetDistanceM: s.targetDistanceM,
      targetDurationS: s.targetDurationS,
      targetPaceSPerKm: s.targetPaceSPerKm,
    })),
  };
}

export function toSessionData(row: TrainingSessionData): TrainingSessionData {
  return {
    id: row.id,
    orgId: row.orgId,
    origin: row.origin,
    sessionType: row.sessionType,
    targetDistanceM: row.targetDistanceM,
    targetDurationS: row.targetDurationS,
    targetPaceSPerKm: row.targetPaceSPerKm,
    scheduledAt: row.scheduledAt,
    groupId: row.groupId,
    athleteId: row.athleteId,
    sourceTemplateId: row.sourceTemplateId,
    customizesSessionId: row.customizesSessionId,
  };
}

// Locks the template row inside the transaction so concurrent updates/deletes/assignments
// serialize cleanly without P2002, P2003, or P2025 under READ COMMITTED.
// - "update": FOR NO KEY UPDATE (allows external FOR KEY SHARE FK checks while blocking updates/deletes/assigns)
// - "delete": FOR UPDATE (blocks FK references while removing the primary key)
// - "assign": FOR SHARE (allows concurrent assignments while waiting for update/delete)
async function lockTemplate(
  tx: Prisma.TransactionClient,
  orgId: string,
  id: string,
  mode: "update" | "delete" | "assign"
): Promise<void> {
  if (!isDbId(orgId) || !isDbId(id)) {
    throw new TrainingNotFoundError();
  }
  const normalizedId = normalizeId(id);
  let rows: { id: string; org_id: string }[];
  switch (mode) {
    case "update":
      rows = await tx.$queryRaw<{ id: string; org_id: string }[]>`
        SELECT id, org_id FROM training_templates WHERE id = ${normalizedId}::uuid FOR NO KEY UPDATE
      `;
      break;
    case "assign":
      rows = await tx.$queryRaw<{ id: string; org_id: string }[]>`
        SELECT id, org_id FROM training_templates WHERE id = ${normalizedId}::uuid FOR SHARE
      `;
      break;
    case "delete":
      rows = await tx.$queryRaw<{ id: string; org_id: string }[]>`
        SELECT id, org_id FROM training_templates WHERE id = ${normalizedId}::uuid FOR UPDATE
      `;
      break;
  }
  if (rows.length === 0 || normalizeId(rows[0].org_id) !== normalizeId(orgId)) {
    throw new TrainingNotFoundError();
  }
}

// Always acquire after lockTemplate so lock ordering stays consistent (templates -> groups).
// Decision (#238 row 10): uses FOR NO KEY UPDATE so concurrent assignments to the same group
// serialize and the duplicate check sees committed rows from an earlier click/retry, while
// remaining compatible with external FOR KEY SHARE FK checks (e.g. adding GroupMembers) and
// still serializing with a concurrent group delete (FOR UPDATE).
async function lockGroupForAssign(
  tx: Prisma.TransactionClient,
  orgId: string,
  groupId: string
): Promise<void> {
  if (!isDbId(orgId) || !isDbId(groupId)) {
    throw new TrainingNotFoundError();
  }
  const rows = await tx.$queryRaw<{ id: string; org_id: string }[]>`
    SELECT id, org_id FROM groups WHERE id = ${normalizeId(groupId)}::uuid FOR NO KEY UPDATE
  `;
  if (rows.length === 0 || normalizeId(rows[0].org_id) !== normalizeId(orgId)) {
    throw new TrainingNotFoundError();
  }
}

export class PrismaTrainingRepository implements TrainingRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findRole(orgId: string, userId: string): Promise<MembershipRole | null> {
    if (!isDbId(orgId) || !isDbId(userId)) {
      return null;
    }
    const membership = await this.db.membership.findUnique({
      where: {
        userId_orgId: {
          userId: normalizeId(userId),
          orgId: normalizeId(orgId),
        },
      },
      select: { role: true },
    });
    return membership?.role ?? null;
  }

  async findOtherManagerIds(
    orgId: string,
    excludeUserId: string,
    tx?: Prisma.TransactionClient
  ): Promise<string[]> {
    if (!isDbId(orgId) || !isDbId(excludeUserId)) {
      return [];
    }
    const client = tx ?? this.db;
    const managers = await client.membership.findMany({
      where: {
        orgId: normalizeId(orgId),
        role: "manager",
        userId: { not: normalizeId(excludeUserId) },
      },
      select: { userId: true },
    });
    return managers.map((m) => m.userId);
  }

  async findById(id: string): Promise<TrainingTemplateData | null> {
    if (!isDbId(id)) {
      return null;
    }
    const template = await this.db.trainingTemplate.findUnique({
      where: { id: normalizeId(id) },
      include: {
        sessions: {
          orderBy: { position: "asc" },
        },
      },
    });
    if (!template) return null;

    return toTemplateData(template);
  }

  async listForManager(orgId: string): Promise<TrainingTemplateData[]> {
    if (!isDbId(orgId)) {
      return [];
    }
    const templates = await this.db.trainingTemplate.findMany({
      where: { orgId: normalizeId(orgId) },
      include: {
        sessions: {
          orderBy: { position: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return templates.map(toTemplateData);
  }

  async listForAthlete(orgId: string, athleteId: string): Promise<TrainingTemplateData[]> {
    if (!isDbId(orgId) || !isDbId(athleteId)) {
      return [];
    }
    const templates = await this.db.trainingTemplate.findMany({
      where: {
        orgId: normalizeId(orgId),
        copies: {
          some: {
            group: {
              members: {
                some: {
                  userId: normalizeId(athleteId),
                },
              },
            },
          },
        },
      },
      include: {
        sessions: {
          orderBy: { position: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return templates.map(toTemplateData);
  }

  async create(
    input: CreateTrainingTemplateInput,
    afterWrite?: TrainingMutationCallback
  ): Promise<TrainingTemplateData> {
    return await this.db.$transaction(async (tx) => {
      const template = await tx.trainingTemplate.create({
        data: {
          orgId: normalizeId(input.orgId),
          name: input.name,
          createdBy: normalizeId(input.createdBy),
          sessions: {
            create: input.sessions.map((s, index) => ({
              sessionType: s.sessionType,
              dayOffset: s.dayOffset,
              position: index,
              targetDistanceM: s.targetDistanceM ?? null,
              targetDurationS: s.targetDurationS ?? null,
              targetPaceSPerKm: s.targetPaceSPerKm ?? null,
            })),
          },
        },
        include: {
          sessions: {
            orderBy: { position: "asc" },
          },
        },
      });

      // Notify inside the transaction so a notification error rolls back the created template.
      await afterWrite?.(template.id, tx);

      return toTemplateData(template);
    });
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateTrainingTemplateInput,
    afterWrite?: TrainingMutationCallback
  ): Promise<TrainingTemplateData> {
    const normalizedId = normalizeId(id);
    return await this.db.$transaction(async (tx) => {
      await lockTemplate(tx, orgId, normalizedId, "update");

      // Replace TemplateSessions (0..n-1) rather than diffing positions; copied TrainingSessions
      // in groups are independent rows and keep their original values.
      if (input.sessions) {
        await tx.templateSession.deleteMany({
          where: { templateId: normalizedId },
        });
        await tx.templateSession.createMany({
          data: input.sessions.map((s, index) => ({
            templateId: normalizedId,
            sessionType: s.sessionType,
            dayOffset: s.dayOffset,
            position: index,
            targetDistanceM: s.targetDistanceM ?? null,
            targetDurationS: s.targetDurationS ?? null,
            targetPaceSPerKm: s.targetPaceSPerKm ?? null,
          })),
        });
      }

      const updated = await tx.trainingTemplate.update({
        where: { id: normalizedId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
        },
        include: {
          sessions: {
            orderBy: { position: "asc" },
          },
        },
      });

      await afterWrite?.(updated.id, tx);

      return toTemplateData(updated);
    });
  }

  async delete(
    orgId: string,
    id: string,
    afterWrite?: TrainingMutationCallback
  ): Promise<void> {
    const normalizedId = normalizeId(id);
    await this.db.$transaction(async (tx) => {
      await lockTemplate(tx, orgId, normalizedId, "delete");
      // TemplateSessions cascade-delete; copied TrainingSessions keep sourceTemplateId set to null.
      await tx.trainingTemplate.delete({
        where: { id: normalizedId },
      });
      await afterWrite?.(normalizedId, tx);
    });
  }

  async assignTemplateToGroup(
    input: AssignTrainingTemplateInput,
    afterAssign?: TrainingAssignCallback
  ): Promise<TrainingSessionData[]> {
    if (
      !isDbId(input.orgId) ||
      !isDbId(input.templateId) ||
      !isDbId(input.groupId)
    ) {
      throw new TrainingNotFoundError();
    }
    const normalizedOrgId = normalizeId(input.orgId);
    const normalizedTemplateId = normalizeId(input.templateId);
    const normalizedGroupId = normalizeId(input.groupId);

    return await this.db.$transaction(async (tx) => {
      // Lock template then group in fixed order so concurrent delete/update and double-submits serialize cleanly.
      await lockTemplate(tx, normalizedOrgId, normalizedTemplateId, "assign");
      await lockGroupForAssign(tx, normalizedOrgId, normalizedGroupId);

      const org = await tx.organization.findUnique({
        where: { id: normalizedOrgId },
        select: { timezone: true },
      });
      if (!org) {
        throw new TrainingNotFoundError();
      }

      const templateSessions = await tx.templateSession.findMany({
        where: { templateId: normalizedTemplateId },
        orderBy: { position: "asc" },
      });

      const plannedSessions = templateSessions.map((s) => ({
        orgId: normalizedOrgId,
        origin: "template" as const,
        sessionType: s.sessionType,
        targetDistanceM: s.targetDistanceM,
        targetDurationS: s.targetDurationS,
        targetPaceSPerKm: s.targetPaceSPerKm,
        scheduledAt: computeScheduledAtUtc(
          input.startDate,
          s.dayOffset,
          org.timezone
        ),
        groupId: normalizedGroupId,
        athleteId: null,
        sourceTemplateId: normalizedTemplateId,
      }));

      if (plannedSessions.length > 0) {
        const uniqueDates = Array.from(
          new Map(
            plannedSessions.map((s) => [s.scheduledAt.getTime(), s.scheduledAt])
          ).values()
        );
        const existingSessions = await tx.trainingSession.findMany({
          where: {
            orgId: normalizedOrgId,
            groupId: normalizedGroupId,
            sourceTemplateId: normalizedTemplateId,
            origin: "template",
            scheduledAt: { in: uniqueDates },
          },
          select: { scheduledAt: true, sessionType: true },
        });
        if (isDuplicateTemplateAssignment(plannedSessions, existingSessions)) {
          throw new TrainingConflictError();
        }
      }

      const created = await tx.trainingSession.createManyAndReturn({
        data: plannedSessions,
      });

      const groupAthletes = await tx.groupMember.findMany({
        where: {
          groupId: normalizedGroupId,
          user: {
            memberships: {
              some: {
                orgId: normalizedOrgId,
                role: "athlete",
              },
            },
          },
        },
        select: { userId: true },
      });

      await afterAssign?.(
        groupAthletes.map((m) => m.userId),
        tx
      );

      return created.map(toSessionData);
    });
  }

  async getAthleteSchedule(
    orgId: string,
    athleteId: string
  ): Promise<TrainingSessionData[]> {
    if (!isDbId(orgId) || !isDbId(athleteId)) {
      return [];
    }
    const normalizedOrgId = normalizeId(orgId);
    const normalizedAthleteId = normalizeId(athleteId);

    // Known limit: group template sessions come only from the athlete's current groups
    // (group.members.some). If an athlete leaves a group or the group is deleted
    // (groupId becomes null), previously logged template sessions from it disappear
    // from the schedule. Also, customizesSessionId has no DB CHECK constraint tying it
    // to the same org or origin "template"; org/athlete filters prevent cross-club leaks.
    const sessions = await this.db.trainingSession.findMany({
      where: {
        orgId: normalizedOrgId,
        OR: [
          {
            origin: "template",
            group: {
              orgId: normalizedOrgId,
              members: {
                some: { userId: normalizedAthleteId },
              },
            },
          },
          {
            origin: { in: ["customized", "free"] },
            athleteId: normalizedAthleteId,
          },
        ],
      },
      include: {
        logs: {
          where: { athleteId: normalizedAthleteId },
          select: { sessionId: true },
        },
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    });

    const loggedSessionIds = new Set<string>();
    for (const session of sessions) {
      if (session.logs.length > 0) {
        loggedSessionIds.add(session.id);
      }
    }

    return excludeSubstitutedGroupSessions(
      sessions.map(toSessionData),
      loggedSessionIds
    );
  }

  async listClubSessions(orgId: string): Promise<TrainingSessionData[]> {
    if (!isDbId(orgId)) {
      return [];
    }
    // Known limit: returns every session in the club (including customized and free
    // sessions of former members, since club exit only removes Membership and
    // GroupMember rows without deleting sessions).
    const sessions = await this.db.trainingSession.findMany({
      where: { orgId: normalizeId(orgId) },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    });
    return sessions.map(toSessionData);
  }
}

export const trainingRepository: TrainingRepository = new PrismaTrainingRepository();
