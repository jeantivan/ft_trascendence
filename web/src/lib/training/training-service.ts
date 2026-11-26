import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { normalizeId } from "@/lib/org/schemas";
import {
  assignTrainingTemplateSchema,
  trainingTemplateSchema,
  templateSessionSchema,
  trainingTemplateNameSchema,
} from "./schemas";
import {
  TRAINING_TEMPLATE_ASSIGNED,
  TRAINING_TEMPLATE_CREATED,
  TRAINING_TEMPLATE_DELETED,
  TRAINING_TEMPLATE_UPDATED,
  type TrainingNotify,
  type TrainingRepository,
  type TrainingSessionData,
  type TrainingTemplateData,
  type TrainingTemplateManagerNotificationType,
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
    private readonly notifier?: TrainingNotify
  ) {}

  // Re-checked here even when Server Actions call requireOrgRole, so the service enforces
  // club membership and role independently in unit tests and non-action callers.
  // Known limit (#238): role is checked before the repository transaction, so a concurrent
  // demotion or removal in the same millisecond lets the operation proceed.
  private async assertRole(orgId: string, actorId: string): Promise<"manager" | "athlete"> {
    const role = await this.repo.findRole(orgId, actorId);
    if (!role) {
      throw new TrainingNotFoundError();
    }
    return role;
  }

  // Known limit (#238): inside update/delete, notifying another Manager whose account is being
  // deleted at the same millisecond can deadlock (P2034) between training_templates and users
  // (created_by ON DELETE SET NULL), matching the lock order note in organization-repository.ts.
  private async notifyOtherManagers(
    orgId: string,
    actorId: string,
    templateId: string,
    type: TrainingTemplateManagerNotificationType,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    if (!this.notifier) {
      return;
    }
    const otherManagers = await this.repo.findOtherManagerIds(orgId, actorId, tx);
    for (const userId of otherManagers) {
      await this.notifier(tx, {
        userId,
        type,
        payload: {
          orgId,
          templateId,
        },
      });
    }
  }

  async listTemplates(actorId: string, orgId: string): Promise<TrainingTemplateData[]> {
    const normalizedOrgId = normalizeId(orgId);
    const normalizedActorId = normalizeId(actorId);
    const role = await this.assertRole(normalizedOrgId, normalizedActorId);
    if (role === "manager") {
      return this.repo.listForManager(normalizedOrgId);
    }
    return this.repo.listForAthlete(normalizedOrgId, normalizedActorId);
  }

  async getTemplate(
    actorId: string,
    orgId: string,
    templateId: string
  ): Promise<TrainingTemplateData> {
    const normalizedOrgId = normalizeId(orgId);
    const normalizedActorId = normalizeId(actorId);
    const normalizedTemplateId = normalizeId(templateId);

    const role = await this.assertRole(normalizedOrgId, normalizedActorId);
    const template = await this.repo.findById(normalizedTemplateId);
    if (!template || normalizeId(template.orgId) !== normalizedOrgId) {
      throw new TrainingNotFoundError();
    }

    if (role === "athlete") {
      const visibleTemplates = await this.repo.listForAthlete(
        normalizedOrgId,
        normalizedActorId
      );
      const isVisible = visibleTemplates.some(
        (t) => normalizeId(t.id) === normalizedTemplateId
      );
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
    const normalizedOrgId = normalizeId(orgId);
    const normalizedActorId = normalizeId(actorId);
    const role = await this.assertRole(normalizedOrgId, normalizedActorId);
    if (role !== "manager") {
      throw new TrainingForbiddenError();
    }

    const parseResult = trainingTemplateSchema.safeParse(input);
    if (!parseResult.success) {
      const message = parseResult.error.issues[0]?.message ?? "Datos inválidos";
      throw new TrainingValidationError(message);
    }

    // Known limit (#238): concurrent club deletion can trigger P2003 on training_templates_org_id_fkey.
    return this.repo.create(
      {
        orgId: normalizedOrgId,
        name: parseResult.data.name,
        createdBy: normalizedActorId,
        sessions: parseResult.data.sessions,
      },
      (createdId, tx) =>
        this.notifyOtherManagers(
          normalizedOrgId,
          normalizedActorId,
          createdId,
          TRAINING_TEMPLATE_CREATED,
          tx
        )
    );
  }

  async updateTemplate(
    actorId: string,
    orgId: string,
    templateId: string,
    input: unknown
  ): Promise<TrainingTemplateData> {
    const normalizedOrgId = normalizeId(orgId);
    const normalizedActorId = normalizeId(actorId);
    const normalizedTemplateId = normalizeId(templateId);

    const role = await this.assertRole(normalizedOrgId, normalizedActorId);
    if (role !== "manager") {
      throw new TrainingForbiddenError();
    }

    const parseResult = updateTrainingTemplateSchema.safeParse(input);
    if (!parseResult.success) {
      const message = parseResult.error.issues[0]?.message ?? "Datos inválidos";
      throw new TrainingValidationError(message);
    }

    // Existence and org ownership are checked inside repo.update under the row lock (FOR UPDATE).
    return this.repo.update(
      normalizedOrgId,
      normalizedTemplateId,
      {
        name: parseResult.data.name,
        sessions: parseResult.data.sessions,
      },
      (updatedId, tx) =>
        this.notifyOtherManagers(
          normalizedOrgId,
          normalizedActorId,
          updatedId,
          TRAINING_TEMPLATE_UPDATED,
          tx
        )
    );
  }

  async deleteTemplate(
    actorId: string,
    orgId: string,
    templateId: string
  ): Promise<void> {
    const normalizedOrgId = normalizeId(orgId);
    const normalizedActorId = normalizeId(actorId);
    const normalizedTemplateId = normalizeId(templateId);

    const role = await this.assertRole(normalizedOrgId, normalizedActorId);
    if (role !== "manager") {
      throw new TrainingForbiddenError();
    }

    // Existence and org ownership are checked inside repo.delete under the row lock (FOR UPDATE).
    await this.repo.delete(normalizedOrgId, normalizedTemplateId, (deletedId, tx) =>
      this.notifyOtherManagers(
        normalizedOrgId,
        normalizedActorId,
        deletedId,
        TRAINING_TEMPLATE_DELETED,
        tx
      )
    );
  }

  // Decision (#238 row 10): to prevent accidental duplicate copies on double-click / concurrent
  // retries without adding a schema migration, the repository serializes assignments on the Group
  // row (FOR NO KEY UPDATE) and rejects with TrainingConflictError when the exact same template
  // already has all planned (scheduledAt, sessionType) copies in that group.
  //
  // Known limit (#238):
  // - because each assignment's startDate is not stored in a separate column, reassigning a
  //   periodic template (e.g. rodaje on dayOffset 0 and 7) on an intermediate startDate whose
  //   planned (scheduledAt, sessionType) signatures are all already covered by surrounding
  //   assignments (e.g. 2026-06-01 and 2026-06-15, then 2026-06-08) also raises TrainingConflictError.
  // - concurrent group membership edits in the same millisecond are out of scope.
  // - notifying group Athletes inside the transaction acquires FOR KEY SHARE on users(id); a
  //   concurrent account deletion (users FOR UPDATE) can fail with P2003 (notifications_user_id_fkey)
  //   or deadlock (40P01 / P2034) if that user created the template (created_by ON DELETE SET NULL).
  // - locking training_templates -> groups before inserting sessions (FOR KEY SHARE on organizations)
  //   is the inverse order of purgeExpiredOrganizations (organizations FOR UPDATE -> CASCADE), so a
  //   concurrent club purge in the same millisecond can deadlock (40P01 / P2034) or fail with P2003.
  async assignTemplateToGroup(
    actorId: string,
    orgId: string,
    input: unknown
  ): Promise<TrainingSessionData[]> {
    const normalizedOrgId = normalizeId(orgId);
    const normalizedActorId = normalizeId(actorId);
    const role = await this.assertRole(normalizedOrgId, normalizedActorId);

    if (role !== "manager") {
      throw new TrainingForbiddenError();
    }

    const parseResult = assignTrainingTemplateSchema.safeParse(input);
    if (!parseResult.success) {
      const message = parseResult.error.issues[0]?.message ?? "Datos inválidos";
      throw new TrainingValidationError(message);
    }

    return this.repo.assignTemplateToGroup(
      {
        orgId: normalizedOrgId,
        templateId: parseResult.data.templateId,
        groupId: parseResult.data.groupId,
        startDate: parseResult.data.startDate,
      },
      async (athleteIds, tx) => {
        if (!this.notifier) {
          return;
        }
        for (const userId of athleteIds) {
          await this.notifier(tx, {
            userId,
            type: TRAINING_TEMPLATE_ASSIGNED,
            payload: {
              orgId: normalizedOrgId,
              templateId: parseResult.data.templateId,
              groupId: parseResult.data.groupId,
            },
          });
        }
      }
    );
  }

  async getAthleteSchedule(
    actorId: string,
    orgId: string,
    athleteId?: string
  ): Promise<TrainingSessionData[]> {
    const normalizedOrgId = normalizeId(orgId);
    const normalizedActorId = normalizeId(actorId);
    const targetAthleteId =
      athleteId !== undefined ? normalizeId(athleteId) : normalizedActorId;

    const role = await this.assertRole(normalizedOrgId, normalizedActorId);

    if (role === "athlete") {
      if (targetAthleteId !== normalizedActorId) {
        throw new TrainingNotFoundError();
      }
    } else {
      const targetRole = await this.repo.findRole(
        normalizedOrgId,
        targetAthleteId
      );
      if (targetRole !== "athlete") {
        throw new TrainingNotFoundError();
      }
    }

    return this.repo.getAthleteSchedule(normalizedOrgId, targetAthleteId);
  }

  async listClubSessions(
    actorId: string,
    orgId: string
  ): Promise<TrainingSessionData[]> {
    const normalizedOrgId = normalizeId(orgId);
    const normalizedActorId = normalizeId(actorId);
    const role = await this.assertRole(normalizedOrgId, normalizedActorId);
    if (role !== "manager") {
      throw new TrainingForbiddenError();
    }
    return this.repo.listClubSessions(normalizedOrgId);
  }
}
