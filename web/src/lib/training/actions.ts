"use server";

import { forbidden, notFound } from "next/navigation";
import { requireOrgRole } from "@/lib/permissions/require-org-role";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { notify } from "@/lib/notifications/notify";
import { trainingRepository } from "./prisma-training-repository";
import { TrainingService } from "./training-service";
import {
  TrainingForbiddenError,
  TrainingNotFoundError,
  TrainingValidationError,
} from "./errors";
import type { TrainingSessionData, TrainingTemplateData } from "./types";

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

const trainingService = new TrainingService(trainingRepository, notify);

// Translates domain errors into Next.js HTTP signals or form validation results;
// requireOrgRole must still be called outside this wrapper in every action.
async function runTrainingAction<T>(
  operation: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await operation() };
  } catch (error) {
    if (error instanceof TrainingNotFoundError) {
      notFound();
    }
    if (error instanceof TrainingForbiddenError) {
      forbidden();
    }
    if (error instanceof TrainingValidationError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function listTrainingTemplatesAction(
  orgId: string
): Promise<ActionResult<TrainingTemplateData[]>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.read"]);
  return runTrainingAction(() => trainingService.listTemplates(user.id, orgId));
}

export async function getTrainingTemplateAction(
  orgId: string,
  templateId: string
): Promise<ActionResult<TrainingTemplateData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.read"]);
  return runTrainingAction(() =>
    trainingService.getTemplate(user.id, orgId, templateId)
  );
}

export async function createTrainingTemplateAction(
  orgId: string,
  input: unknown
): Promise<ActionResult<TrainingTemplateData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.write"]);
  return runTrainingAction(() =>
    trainingService.createTemplate(user.id, orgId, input)
  );
}

export async function updateTrainingTemplateAction(
  orgId: string,
  templateId: string,
  input: unknown
): Promise<ActionResult<TrainingTemplateData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.write"]);
  return runTrainingAction(() =>
    trainingService.updateTemplate(user.id, orgId, templateId, input)
  );
}

export async function deleteTrainingTemplateAction(
  orgId: string,
  templateId: string
): Promise<ActionResult<void>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.write"]);
  return runTrainingAction(() =>
    trainingService.deleteTemplate(user.id, orgId, templateId)
  );
}

export async function assignTrainingTemplateAction(
  orgId: string,
  input: unknown
): Promise<ActionResult<TrainingSessionData[]>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.write"]);
  return runTrainingAction(() =>
    trainingService.assignTemplateToGroup(user.id, orgId, input)
  );
}
