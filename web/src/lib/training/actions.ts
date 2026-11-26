"use server";

import { forbidden, notFound } from "next/navigation";
import { requireOrgRole } from "@/lib/permissions/require-org-role";
import type { OrgRole } from "@/lib/permissions/org-role";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { notify } from "@/lib/notifications/notify";
import { trainingRepository } from "./prisma-training-repository";
import { TrainingService } from "./training-service";
import {
  TrainingConflictError,
  TrainingForbiddenError,
  TrainingNotFoundError,
  TrainingValidationError,
  type TrainingConflictCode,
} from "./errors";
import type { TrainingSessionData, TrainingTemplateData } from "./types";

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: TrainingConflictCode };

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
    if (error instanceof TrainingConflictError) {
      return error.code !== undefined
        ? { success: false, error: error.message, code: error.code }
        : { success: false, error: error.message };
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

// Both schedule queries return template/customized ("session.read") and free
// ("freeSession.read") sessions, so access requires a role present in both rows.
// Kept unexported because "use server" files may only export async functions.
const freeSessionReadRoles: readonly OrgRole[] = ORG_ROLES["freeSession.read"];
const SCHEDULE_READ_ROLES: readonly OrgRole[] = ORG_ROLES[
  "session.read"
].filter((role) => freeSessionReadRoles.includes(role));

export async function getAthleteScheduleAction(
  orgId: string,
  athleteId?: string
): Promise<ActionResult<TrainingSessionData[]>> {
  const { user } = await requireOrgRole(orgId, SCHEDULE_READ_ROLES);
  return runTrainingAction(() =>
    trainingService.getAthleteSchedule(user.id, orgId, athleteId)
  );
}

export async function listClubSessionsAction(
  orgId: string
): Promise<ActionResult<TrainingSessionData[]>> {
  const { user } = await requireOrgRole(orgId, SCHEDULE_READ_ROLES);
  return runTrainingAction(() =>
    trainingService.listClubSessions(user.id, orgId)
  );
}

export async function createCustomizedSessionAction(
  orgId: string,
  input: unknown
): Promise<ActionResult<TrainingSessionData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["session.write"]);
  return runTrainingAction(() =>
    trainingService.createCustomizedSession(user.id, orgId, input)
  );
}

export async function updateManagerSessionAction(
  orgId: string,
  sessionId: string,
  input: unknown
): Promise<ActionResult<TrainingSessionData>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["session.write"]);
  return runTrainingAction(() =>
    trainingService.updateManagerSession(user.id, orgId, sessionId, input)
  );
}

export async function deleteManagerSessionAction(
  orgId: string,
  sessionId: string
): Promise<ActionResult<void>> {
  const { user } = await requireOrgRole(orgId, ORG_ROLES["session.write"]);
  return runTrainingAction(() =>
    trainingService.deleteManagerSession(user.id, orgId, sessionId)
  );
}
