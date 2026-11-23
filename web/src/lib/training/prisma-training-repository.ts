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
import { TrainingNotFoundError } from "./errors";
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

// Locks the template row inside the transaction so concurrent updates/deletes/assignments
// serialize cleanly without P2002, P2003, or P2025 under READ COMMITTED.
// - "update": FOR NO KEY UPDATE (allows external FOR KEY SHARE FK checks while blocking updates/deletes/assigns)
// - "delete": FOR UPDATE (blocks FK references while removing the primary key)
// - "share": FOR SHARE (allows concurrent assignments while waiting for update/delete)
async function lockTemplate(
  tx: Prisma.TransactionClient,
  orgId: string,
  id: string,
  mode: "update" | "delete" | "share"
): Promise<void> {
  if (!isDbId(orgId) || !isDbId(id)) {
    throw new TrainingNotFoundError();
  }
  const normalizedId = normalizeId(id);
  const rows =
    mode === "update"
      ? await tx.$queryRaw<{ id: string; org_id: string }[]>`
          SELECT id, org_id FROM training_templates WHERE id = ${normalizedId}::uuid FOR NO KEY UPDATE
        `
      : mode === "share"
        ? await tx.$queryRaw<{ id: string; org_id: string }[]>`
            SELECT id, org_id FROM training_templates WHERE id = ${normalizedId}::uuid FOR SHARE
          `
        : await tx.$queryRaw<{ id: string; org_id: string }[]>`
            SELECT id, org_id FROM training_templates WHERE id = ${normalizedId}::uuid FOR UPDATE
          `;
  if (rows.length === 0 || normalizeId(rows[0].org_id) !== normalizeId(orgId)) {
    throw new TrainingNotFoundError();
  }
}

// Always acquire after lockTemplate so lock ordering stays consistent (templates -> groups).
// Uses FOR SHARE so concurrent assignments to the same group do not block each other, while
// a concurrent group delete waits until this transaction finishes.
async function lockGroupForShare(
  tx: Prisma.TransactionClient,
  orgId: string,
  groupId: string
): Promise<void> {
  if (!isDbId(orgId) || !isDbId(groupId)) {
    throw new TrainingNotFoundError();
  }
  const rows = await tx.$queryRaw<{ id: string; org_id: string }[]>`
    SELECT id, org_id FROM groups WHERE id = ${normalizeId(groupId)}::uuid FOR SHARE
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
      // Lock template then group in fixed order so concurrent delete/update serializes cleanly.
      await lockTemplate(tx, normalizedOrgId, normalizedTemplateId, "share");
      await lockGroupForShare(tx, normalizedOrgId, normalizedGroupId);

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

      const created = await tx.trainingSession.createManyAndReturn({
        data: templateSessions.map((s) => ({
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
        })),
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

      return created.map((row) => ({
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
      }));
    });
  }
}

export const trainingRepository: TrainingRepository = new PrismaTrainingRepository();
