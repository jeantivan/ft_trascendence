import { prisma } from "@/lib/prisma";
import type { PrismaClient, MembershipRole } from "@/generated/prisma/client";
import type {
  TrainingRepository,
  TrainingTemplateData,
  CreateTrainingTemplateInput,
  UpdateTrainingTemplateInput,
} from "./types";

export class PrismaTrainingRepository implements TrainingRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findRole(orgId: string, userId: string): Promise<MembershipRole | null> {
    const membership = await this.db.membership.findUnique({
      where: { userId_orgId: { userId, orgId } },
      select: { role: true },
    });
    return membership?.role ?? null;
  }

  async findOtherManagerIds(orgId: string, excludeUserId: string): Promise<string[]> {
    const managers = await this.db.membership.findMany({
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
    const template = await this.db.trainingTemplate.findUnique({
      where: { id },
      include: {
        sessions: {
          orderBy: { position: "asc" },
        },
      },
    });
    if (!template) return null;

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

    return templates.map((t) => ({
      id: t.id,
      orgId: t.orgId,
      name: t.name,
      createdBy: t.createdBy,
      sessions: t.sessions.map((s) => ({
        sessionType: s.sessionType,
        dayOffset: s.dayOffset,
        position: s.position,
        targetDistanceM: s.targetDistanceM,
        targetDurationS: s.targetDurationS,
        targetPaceSPerKm: s.targetPaceSPerKm,
      })),
    }));
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

    return templates.map((t) => ({
      id: t.id,
      orgId: t.orgId,
      name: t.name,
      createdBy: t.createdBy,
      sessions: t.sessions.map((s) => ({
        sessionType: s.sessionType,
        dayOffset: s.dayOffset,
        position: s.position,
        targetDistanceM: s.targetDistanceM,
        targetDurationS: s.targetDurationS,
        targetPaceSPerKm: s.targetPaceSPerKm,
      })),
    }));
  }

  async create(input: CreateTrainingTemplateInput): Promise<TrainingTemplateData> {
    const template = await this.db.trainingTemplate.create({
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

  async update(id: string, input: UpdateTrainingTemplateInput): Promise<TrainingTemplateData> {
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

      return {
        id: updated.id,
        orgId: updated.orgId,
        name: updated.name,
        createdBy: updated.createdBy,
        sessions: updated.sessions.map((s) => ({
          sessionType: s.sessionType,
          dayOffset: s.dayOffset,
          position: s.position,
          targetDistanceM: s.targetDistanceM,
          targetDurationS: s.targetDurationS,
          targetPaceSPerKm: s.targetPaceSPerKm,
        })),
      };
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.trainingTemplate.delete({
      where: { id },
    });
  }
}

export const trainingRepository: TrainingRepository = new PrismaTrainingRepository();
