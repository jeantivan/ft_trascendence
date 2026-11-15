import { z } from "zod";
import {
  trainingTemplateSchema,
  templateSessionSchema,
  trainingTemplateNameSchema,
} from "./schemas";
import type {
  TrainingRepository,
  TrainingTemplateData,
  TrainingNotificationPublisher,
} from "./types";
import {
  TrainingForbiddenError,
  TrainingNotFoundError,
  TrainingValidationError,
} from "./errors";

const updateTrainingTemplateSchema = z
  .object({
    name: trainingTemplateNameSchema.optional(),
    sessions: z
      .array(templateSessionSchema)
      .min(1, "La plantilla debe tener al menos una sesión")
      .optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.sessions !== undefined,
    { message: "Debe proporcionar al menos un campo para actualizar" }
  );

export class TrainingService {
  constructor(
    private readonly repo: TrainingRepository,
    private readonly notifier?: TrainingNotificationPublisher
  ) {}

  private async assertRole(orgId: string, actorId: string): Promise<"manager" | "athlete"> {
    const role = await this.repo.findRole(orgId, actorId);
    if (!role) {
      throw new TrainingNotFoundError();
    }
    return role;
  }

  async listTemplates(actorId: string, orgId: string): Promise<TrainingTemplateData[]> {
    const role = await this.assertRole(orgId, actorId);
    if (role === "manager") {
      return this.repo.listForManager(orgId);
    }
    return this.repo.listForAthlete(orgId, actorId);
  }

  async getTemplate(
    actorId: string,
    orgId: string,
    templateId: string
  ): Promise<TrainingTemplateData> {
    const role = await this.assertRole(orgId, actorId);
    const template = await this.repo.findById(templateId);
    if (!template || template.orgId !== orgId) {
      throw new TrainingNotFoundError();
    }

    if (role === "athlete") {
      const visibleTemplates = await this.repo.listForAthlete(orgId, actorId);
      const isVisible = visibleTemplates.some((t) => t.id === templateId);
      if (!isVisible) {
        throw new TrainingNotFoundError();
      }
    }

    return template;
  }

  async createTemplate(
    actorId: string,
    orgId: string,
    input: unknown
  ): Promise<TrainingTemplateData> {
    const role = await this.assertRole(orgId, actorId);
    if (role !== "manager") {
      throw new TrainingForbiddenError();
    }

    const parseResult = trainingTemplateSchema.safeParse(input);
    if (!parseResult.success) {
      const message = parseResult.error.issues[0]?.message ?? "Datos inválidos";
      throw new TrainingValidationError(message);
    }

    const created = await this.repo.create({
      orgId,
      name: parseResult.data.name,
      createdBy: actorId,
      sessions: parseResult.data.sessions,
    });

    if (this.notifier) {
      const otherManagers = await this.repo.findOtherManagerIds(orgId, actorId);
      if (otherManagers.length > 0) {
        await this.notifier({
          orgId,
          templateId: created.id,
          action: "created",
          actorId,
          recipientIds: otherManagers,
        });
      }
    }

    return created;
  }

  async updateTemplate(
    actorId: string,
    orgId: string,
    templateId: string,
    input: unknown
  ): Promise<TrainingTemplateData> {
    const role = await this.assertRole(orgId, actorId);
    if (role !== "manager") {
      throw new TrainingForbiddenError();
    }

    const existing = await this.repo.findById(templateId);
    if (!existing || existing.orgId !== orgId) {
      throw new TrainingNotFoundError();
    }

    const parseResult = updateTrainingTemplateSchema.safeParse(input);
    if (!parseResult.success) {
      const message = parseResult.error.issues[0]?.message ?? "Datos inválidos";
      throw new TrainingValidationError(message);
    }

    const updated = await this.repo.update(templateId, {
      name: parseResult.data.name,
      sessions: parseResult.data.sessions,
    });

    if (this.notifier) {
      const otherManagers = await this.repo.findOtherManagerIds(orgId, actorId);
      if (otherManagers.length > 0) {
        await this.notifier({
          orgId,
          templateId: updated.id,
          action: "updated",
          actorId,
          recipientIds: otherManagers,
        });
      }
    }

    return updated;
  }

  async deleteTemplate(
    actorId: string,
    orgId: string,
    templateId: string
  ): Promise<void> {
    const role = await this.assertRole(orgId, actorId);
    if (role !== "manager") {
      throw new TrainingForbiddenError();
    }

    const existing = await this.repo.findById(templateId);
    if (!existing || existing.orgId !== orgId) {
      throw new TrainingNotFoundError();
    }

    await this.repo.delete(templateId);

    if (this.notifier) {
      const otherManagers = await this.repo.findOtherManagerIds(orgId, actorId);
      if (otherManagers.length > 0) {
        await this.notifier({
          orgId,
          templateId,
          action: "deleted",
          actorId,
          recipientIds: otherManagers,
        });
      }
    }
  }
}
