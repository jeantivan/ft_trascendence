"use server";

import { requireOrgRole } from "@/lib/permissions/require-org-role";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { trainingRepository } from "./prisma-training-repository";
import { TrainingService } from "./training-service";
import {
  TrainingNotFoundError,
  TrainingValidationError,
} from "./errors";
import type { TrainingTemplateData } from "./types";

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

const defaultService = new TrainingService(trainingRepository);

export async function listTrainingTemplatesAction(
  orgId: string,
  service: TrainingService = defaultService
): Promise<ActionResult<TrainingTemplateData[]>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.read"]);

  try {
    const templates = await service.listTemplates(user.id, orgId);
    return { success: true, data: templates };
  } catch (error) {
    if (error instanceof TrainingValidationError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function getTrainingTemplateAction(
  orgId: string,
  templateId: string,
  service: TrainingService = defaultService
): Promise<ActionResult<TrainingTemplateData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.read"]);

  try {
    const template = await service.getTemplate(user.id, orgId, templateId);
    return { success: true, data: template };
  } catch (error) {
    if (error instanceof TrainingNotFoundError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function createTrainingTemplateAction(
  orgId: string,
  input: unknown,
  service: TrainingService = defaultService
): Promise<ActionResult<TrainingTemplateData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.write"]);

  try {
    const created = await service.createTemplate(user.id, orgId, input);
    return { success: true, data: created };
  } catch (error) {
    if (error instanceof TrainingValidationError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function updateTrainingTemplateAction(
  orgId: string,
  templateId: string,
  input: unknown,
  service: TrainingService = defaultService
): Promise<ActionResult<TrainingTemplateData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.write"]);

  try {
    const updated = await service.updateTemplate(user.id, orgId, templateId, input);
    return { success: true, data: updated };
  } catch (error) {
    if (
      error instanceof TrainingValidationError ||
      error instanceof TrainingNotFoundError
    ) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function deleteTrainingTemplateAction(
  orgId: string,
  templateId: string,
  service: TrainingService = defaultService
): Promise<ActionResult<void>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.write"]);

  try {
    await service.deleteTemplate(user.id, orgId, templateId);
    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof TrainingNotFoundError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}
