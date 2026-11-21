import { prisma } from "@/lib/prisma";
import { isDbId } from "@/lib/permissions/is-db-id";
import type {
  Prisma,
  PrismaClient,
  MembershipRole,
  SessionType,
} from "@/generated/prisma/client";
import type {
  TrainingRepository,
  TrainingTemplateData,
  CreateTrainingTemplateInput,
  UpdateTrainingTemplateInput,
  TrainingMutationCallback,
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

export class PrismaTrainingRepository implements TrainingRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findRole(orgId: string, userId: string): Promise<MembershipRole | null> {
    if (!isDbId(orgId) || !isDbId(userId)) {
      return null;
    }
    const membership = await this.db.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }

  async findOtherManagerIds(
    orgId: string,
    excludeUserId: string,
    tx?: unknown
  ): Promise<string[]> {
    const client = (tx as Prisma.TransactionClient | undefined) ?? this.db;
    const managers = await client.membership.findMany({
      where: {
        orgId,
        role: "manager",
        userId: { not: excludeUserId },
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
      where: { id },
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
    const templates = await this.db.trainingTemplate.findMany({
      where: { orgId },
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
    const templates = await this.db.trainingTemplate.findMany({
      where: {
        orgId,
        copies: {
          some: {
            group: {
              members: {
                some: {
                  userId: athleteId,
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
          orgId: input.orgId,
          name: input.name,
          createdBy: input.createdBy,
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

      await afterWrite?.(template.id, tx);

      return toTemplateData(template);
    });
  }

  async update(
    id: string,
    input: UpdateTrainingTemplateInput,
    afterWrite?: TrainingMutationCallback
  ): Promise<TrainingTemplateData> {
    return await this.db.$transaction(async (tx) => {
      if (input.sessions) {
        await tx.templateSession.deleteMany({
          where: { templateId: id },
        });
        await tx.templateSession.createMany({
          data: input.sessions.map((s, index) => ({
            templateId: id,
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
        where: { id },
        data: {
          ...(input.name ? { name: input.name } : {}),
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

  async delete(id: string, afterWrite?: TrainingMutationCallback): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.trainingTemplate.delete({
        where: { id },
      });
      await afterWrite?.(id, tx);
    });
  }
}

export const trainingRepository: TrainingRepository = new PrismaTrainingRepository();
