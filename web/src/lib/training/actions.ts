"use server";

import { notFound } from "next/navigation";
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

const trainingService = new TrainingService(trainingRepository);

export async function listTrainingTemplatesAction(
  orgId: string
): Promise<ActionResult<TrainingTemplateData[]>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.read"]);

  try {
    const templates = await trainingService.listTemplates(user.id, orgId);
    return { success: true, data: templates };
  } catch (error) {
    if (error instanceof TrainingNotFoundError) {
      notFound();
    }
    if (error instanceof TrainingValidationError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function getTrainingTemplateAction(
  orgId: string,
  templateId: string
): Promise<ActionResult<TrainingTemplateData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.read"]);

  try {
    const template = await trainingService.getTemplate(user.id, orgId, templateId);
    return { success: true, data: template };
  } catch (error) {
    if (error instanceof TrainingNotFoundError) {
      notFound();
    }
    throw error;
  }
}

export async function createTrainingTemplateAction(
  orgId: string,
  input: unknown
): Promise<ActionResult<TrainingTemplateData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.write"]);

  try {
    const created = await trainingService.createTemplate(user.id, orgId, input);
    return { success: true, data: created };
  } catch (error) {
    if (error instanceof TrainingNotFoundError) {
      notFound();
    }
    if (error instanceof TrainingValidationError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function updateTrainingTemplateAction(
  orgId: string,
  templateId: string,
  input: unknown
): Promise<ActionResult<TrainingTemplateData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.write"]);

  try {
    const updated = await trainingService.updateTemplate(user.id, orgId, templateId, input);
    return { success: true, data: updated };
  } catch (error) {
    if (error instanceof TrainingNotFoundError) {
      notFound();
    }
    if (error instanceof TrainingValidationError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

export async function deleteTrainingTemplateAction(
  orgId: string,
  templateId: string
): Promise<ActionResult<void>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.write"]);

  try {
    await trainingService.deleteTemplate(user.id, orgId, templateId);
    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof TrainingNotFoundError) {
      notFound();
    }
    throw error;
  }
}
