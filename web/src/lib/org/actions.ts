"use server";

import { ZodError } from "zod";
import { requireAdmin } from "@/lib/permissions/require-admin";
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
  OrganizationNotFoundError,
  OrganizationService,
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
      return { success: false, error: "El Admin no puede ser Manager del club" };
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
    return { success: false, error: "El Admin no puede ser Manager del club" };
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
