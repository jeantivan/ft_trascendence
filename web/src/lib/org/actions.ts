"use server";

import { ZodError } from "zod";
import { requireAdmin } from "@/lib/permissions/require-admin";
import { requireAuth } from "@/lib/permissions/require-auth";
import { requireOrgRole } from "@/lib/permissions/require-org-role";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { idSchema } from "./schemas";
import {
  AlreadyManagerError,
  LastManagerError,
  NotManagerError,
  OrganizationNameTakenError,
  UserNotFoundError,
} from "./organization-repository";
import {
  AdminCannotBeManagerError,
  AlreadyMemberError,
  MembershipRequestNotFoundError,
  MembershipRequestNotPendingError,
  OrganizationNotFoundError,
  OrganizationService,
  RequestAlreadyPendingError,
} from "./organization-service";

export type UpdateOrganizationActionResult =
  | { success: true }
  | { success: false; error: string };

export type CreateOrganizationActionResult =
  | { success: true; orgId: string }
  | { success: false; error: string };

export type ManagerActionResult =
  | { success: true }
  | { success: false; error: string };

export type MembershipRequestActionResult =
  | { success: true }
  | { success: false; error: string };

const organizationService = new OrganizationService();

// A form cannot send null: an empty or whitespace-only string removes the description.
// A missing field becomes undefined and a file stays a File: the schema rejects both
function descriptionFromForm(formData: FormData): FormDataEntryValue | null | undefined {
  const field = formData.get("description");
  if (typeof field === "string" && field.trim() === "") {
    return null;
  }
  return field ?? undefined;
}

// Bind the club before using it as a form action: updateOrganizationAction.bind(null, orgId).
// The orgId is not trusted: requireOrgRole checks that the session user is a Manager of it.
export async function updateOrganizationAction(
  orgId: string,
  _prevState: unknown,
  formData: FormData
): Promise<UpdateOrganizationActionResult> {
  // Outside try/catch: it checks the session and throws to redirect or reject a non-Manager
  await requireOrgRole(orgId, ORG_ROLES["organization.updateDescription"]);

  const timezone = formData.get("timezone");
  const description = descriptionFromForm(formData);

  try {
    await organizationService.updateOrganization(orgId, { description, timezone });
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: "Descripción o zona horaria no válidas" };
    }
    // The club was deleted after the permission check
    if (error instanceof OrganizationNotFoundError) {
      return { success: false, error: "El club ya no existe" };
    }
    throw error;
  }
  return { success: true };
}

// Form fields, for whoever builds the form (#152):
//   name, description, timezone: one field each.
//   managerIds: one field per Manager, all with the same name (several <input name="managerIds">
//   or <select multiple name="managerIds">), each the Manager's user id.
// The Admin comes from the session: an adminId field in the form is ignored.
export async function createOrganizationAction(
  _prevState: unknown,
  formData: FormData
): Promise<CreateOrganizationActionResult> {
  // Outside try/catch: it checks the session and throws to redirect or reject a non-Admin
  const admin = await requireAdmin();

  try {
    const club = await organizationService.createOrganization(admin.id, {
      name: formData.get("name") ?? undefined,
      description: descriptionFromForm(formData),
      timezone: formData.get("timezone") ?? undefined,
      managerIds: formData.getAll("managerIds"),
    });
    return { success: true, orgId: club.id };
  } catch (error) {
    if (error instanceof ZodError) {
      return { success: false, error: "Datos del club no válidos" };
    }
    if (error instanceof OrganizationNameTakenError) {
      return { success: false, error: "Ya existe un club con ese nombre" };
    }
    if (error instanceof AdminCannotBeManagerError) {
      return { success: false, error: "Ninguna cuenta Admin puede ser Manager de un club" };
    }
    // A Manager that was deleted before or during the creation: no club is left behind
    if (error instanceof UserNotFoundError) {
      return { success: false, error: "Alguno de los Managers ya no existe" };
    }
    throw error;
  }
}

// The service and the repository cast both ids to uuid in SQL: a malformed one would be an
// unexpected database error, so it is rejected here. z.guid(), not z.uuid(): see org-role.ts
// Ids come back lower-cased (see normalizeId)
type ManagerTarget = { ok: true; orgId: string; userId: string } | { ok: false; error: string };

function parseManagerTarget(orgId: string, formData: FormData): ManagerTarget {
  const club = idSchema.safeParse(orgId);
  if (!club.success) {
    return { ok: false, error: "Club no válido" };
  }
  // A missing field (null), an empty string or a file are not a guid
  const userId = idSchema.safeParse(formData.get("userId"));
  if (!userId.success) {
    return { ok: false, error: "Usuario no válido" };
  }
  return { ok: true, orgId: club.data, userId: userId.data };
}

// Bind the club before using it as a form action: assignManagerAction.bind(null, orgId).
// Form field: userId, the id of the user to name Manager.
// The Admin comes from the session. orgId and userId are checked for format only: whether the
// user and the club exist is decided by the repository (UserNotFoundError and
// OrganizationNotFoundError), and an unexpected database error is not turned into either.
export async function assignManagerAction(
  orgId: string,
  _prevState: unknown,
  formData: FormData
): Promise<ManagerActionResult> {
  // Outside try/catch: it checks the session and throws to redirect or reject a non-Admin
  const admin = await requireAdmin();

  const target = parseManagerTarget(orgId, formData);
  if (!target.ok) {
    return { success: false, error: target.error };
  }

  try {
    await organizationService.assignManager(admin.id, target.orgId, target.userId);
  } catch (error) {
    return managerErrorResult(error);
  }
  return { success: true };
}

// Same form field and binding as assignManagerAction. The user stays in the club as an athlete.
export async function removeManagerAction(
  orgId: string,
  _prevState: unknown,
  formData: FormData
): Promise<ManagerActionResult> {
  // Outside try/catch: it checks the session and throws to redirect or reject a non-Admin
  const admin = await requireAdmin();

  const target = parseManagerTarget(orgId, formData);
  if (!target.ok) {
    return { success: false, error: target.error };
  }

  try {
    await organizationService.removeManager(admin.id, target.orgId, target.userId);
  } catch (error) {
    return managerErrorResult(error);
  }
  return { success: true };
}

// Expected errors of assigning or removing a Manager; anything else propagates.
// Shared, but not all reachable from both: assign throws AdminCannotBeManagerError and
// AlreadyManagerError, remove throws NotManagerError and LastManagerError
function managerErrorResult(error: unknown): ManagerActionResult {
  if (error instanceof AdminCannotBeManagerError) {
    return { success: false, error: "Ninguna cuenta Admin puede ser Manager de un club" };
  }
  if (error instanceof AlreadyManagerError) {
    return { success: false, error: "El usuario ya es Manager del club" };
  }
  if (error instanceof NotManagerError) {
    return { success: false, error: "El usuario no es Manager del club" };
  }
  if (error instanceof LastManagerError) {
    return { success: false, error: "El club no puede quedarse sin Manager" };
  }
  if (error instanceof UserNotFoundError) {
    return { success: false, error: "El usuario no existe" };
  }
  if (error instanceof OrganizationNotFoundError) {
    return { success: false, error: "El club ya no existe" };
  }
  throw error;
}

// Invitations and requests to join a club (#149). Form fields, for whoever builds the forms (#152):
//   userId: the user to invite; requestId: the invitation or request to act on;
//   decision: "accept" or "reject" (answering an invitation), "approve" or "reject" (reviewing).
// The acting user always comes from the session, never from a field. The ids are checked for
// format only: whether they exist, and whether they are the caller's, is the repository's job.

function parseRequestId(formData: FormData): { ok: true; id: string } | { ok: false } {
  const parsed = idSchema.safeParse(formData.get("requestId"));
  return parsed.success ? { ok: true, id: parsed.data } : { ok: false };
}

const INVALID_REQUEST: MembershipRequestActionResult = { success: false, error: "Solicitud no válida" };

// Expected errors of these actions; anything else propagates. `own` is true when the caller acts
// on their own invitation or request (the wording changes: "you", not "the user")
function membershipRequestErrorResult(error: unknown, own: boolean): MembershipRequestActionResult {
  if (error instanceof AlreadyMemberError) {
    return { success: false, error: own ? "Ya eres miembro del club" : "El usuario ya es miembro del club" };
  }
  if (error instanceof RequestAlreadyPendingError) {
    return {
      success: false,
      error: own ? "Ya tienes una solicitud o invitación pendiente en el club" : "El usuario ya tiene una solicitud o invitación pendiente",
    };
  }
  // Another club's or another user's request answers like one that does not exist
  if (error instanceof MembershipRequestNotFoundError) {
    return { success: false, error: "La solicitud ya no existe" };
  }
  if (error instanceof MembershipRequestNotPendingError) {
    return { success: false, error: "La solicitud ya está resuelta" };
  }
  // A blocked user reads like a missing one; for the caller's own account that means it cannot act
  if (error instanceof UserNotFoundError) {
    return { success: false, error: own ? "Tu cuenta no puede realizar esta acción" : "El usuario no existe" };
  }
  if (error instanceof OrganizationNotFoundError) {
    return { success: false, error: "El club ya no existe" };
  }
  throw error;
}

// Bind the club: inviteUserAction.bind(null, orgId). Field: userId. Manager of the club only.
export async function inviteUserAction(
  orgId: string,
  _prevState: unknown,
  formData: FormData
): Promise<MembershipRequestActionResult> {
  // Outside try/catch: it checks the session and throws to redirect or reject a non-Manager
  const { user } = await requireOrgRole(orgId, ORG_ROLES["invitation.manage"]);

  const target = parseManagerTarget(orgId, formData);
  if (!target.ok) {
    return { success: false, error: target.error };
  }
  try {
    await organizationService.inviteUser(user.id, target.orgId, target.userId);
  } catch (error) {
    return membershipRequestErrorResult(error, false);
  }
  return { success: true };
}

// Bind the club. Field: requestId. Manager of the club only.
export async function revokeInvitationAction(
  orgId: string,
  _prevState: unknown,
  formData: FormData
): Promise<MembershipRequestActionResult> {
  await requireOrgRole(orgId, ORG_ROLES["invitation.manage"]);

  const club = idSchema.safeParse(orgId);
  const request = parseRequestId(formData);
  if (!club.success || !request.ok) {
    return INVALID_REQUEST;
  }
  try {
    await organizationService.revokeInvitation(club.data, request.id);
  } catch (error) {
    return membershipRequestErrorResult(error, false);
  }
  return { success: true };
}

// Bind the club. Field: requestId and decision ("approve" or "reject"). Manager of the club only.
export async function reviewRequestAction(
  orgId: string,
  _prevState: unknown,
  formData: FormData
): Promise<MembershipRequestActionResult> {
  await requireOrgRole(orgId, ORG_ROLES["membershipRequest.review"]);

  const club = idSchema.safeParse(orgId);
  const request = parseRequestId(formData);
  const decision = formData.get("decision");
  if (!club.success || !request.ok || (decision !== "approve" && decision !== "reject")) {
    return INVALID_REQUEST;
  }
  try {
    await organizationService.reviewRequest(club.data, request.id, decision === "approve");
  } catch (error) {
    return membershipRequestErrorResult(error, false);
  }
  return { success: true };
}

// Bind the club to ask to join: requestToJoinAction.bind(null, orgId). No fields (it takes no state or form data, so it also works as a plain form action). Any signed-in
// user: they are not members yet, so requireAuth and not requireOrgRole.
export async function requestToJoinAction(orgId: string): Promise<MembershipRequestActionResult> {
  const user = await requireAuth();

  const club = idSchema.safeParse(orgId);
  if (!club.success) {
    return { success: false, error: "Club no válido" };
  }
  try {
    await organizationService.requestToJoin(user.id, club.data);
  } catch (error) {
    return membershipRequestErrorResult(error, true);
  }
  return { success: true };
}

// Field: requestId. The caller's own pending request.
export async function withdrawRequestAction(
  _prevState: unknown,
  formData: FormData
): Promise<MembershipRequestActionResult> {
  const user = await requireAuth();

  const request = parseRequestId(formData);
  if (!request.ok) {
    return INVALID_REQUEST;
  }
  try {
    await organizationService.withdrawRequest(user.id, request.id);
  } catch (error) {
    return membershipRequestErrorResult(error, true);
  }
  return { success: true };
}

// Fields: requestId and decision ("accept" or "reject"). The caller's own invitation.
export async function answerInvitationAction(
  _prevState: unknown,
  formData: FormData
): Promise<MembershipRequestActionResult> {
  const user = await requireAuth();

  const request = parseRequestId(formData);
  const decision = formData.get("decision");
  if (!request.ok || (decision !== "accept" && decision !== "reject")) {
    return INVALID_REQUEST;
  }
  try {
    await organizationService.answerInvitation(user.id, request.id, decision === "accept");
  } catch (error) {
    return membershipRequestErrorResult(error, true);
  }
  return { success: true };
}
