import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assignManagerAction,
  createOrganizationAction,
  removeManagerAction,
  updateOrganizationAction,
} from "@/lib/org/actions";
import {
  AlreadyManagerError,
  LastManagerError,
  NotManagerError,
  OrganizationNameTakenError,
  UserNotFoundError,
} from "@/lib/org/organization-repository";
import { AdminCannotBeManagerError, OrganizationNotFoundError } from "@/lib/org/organization-service";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { requireAdmin } from "@/lib/permissions/require-admin";
import { requireOrgRole } from "@/lib/permissions/require-org-role";
import { ZodError } from "zod";

const updateOrganization = vi.hoisted(() => vi.fn());
const createOrganization = vi.hoisted(() => vi.fn());
const assignManager = vi.hoisted(() => vi.fn());
const removeManager = vi.hoisted(() => vi.fn());

vi.mock("@/lib/permissions/require-org-role", () => ({ requireOrgRole: vi.fn() }));
vi.mock("@/lib/permissions/require-admin", () => ({ requireAdmin: vi.fn() }));
// Real error classes, fake service: the schema does not run here, so a ZodError is simulated
// and these tests check what the action passes on and how it translates errors
vi.mock("@/lib/org/organization-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/org/organization-service")>()),
  OrganizationService: class {
    updateOrganization = updateOrganization;
    createOrganization = createOrganization;
    assignManager = assignManager;
    removeManager = removeManager;
  },
}));

// The permission helpers end by throwing a Next signal (notFound(), forbidden(), redirect()) when
// they reject; here any thrown error stands for it
class ForbiddenSignal extends Error {}
class NotFoundSignal extends Error {}

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const MANAGER = { id: "manager-from-session", email: "m@b.c", nick: "Uno", roleGlobal: "user" as const };

const ADMIN = { id: "admin-from-session", email: "a@b.c", nick: "Admin", roleGlobal: "admin" as const };
const MANAGER_A = "00000000-0000-4000-8000-000000000001";
const MANAGER_B = "00000000-0000-4000-8000-000000000002";

// A field with several values (managerIds) is given as an array: one form entry per value
function formWith(fields: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      form.append(name, item);
    }
  }
  return form;
}

function fileForm(name: string): FormData {
  const form = new FormData();
  form.append(name, new File(["x"], "x.txt"));
  return form;
}

describe("updateOrganizationAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lets the Manager update the description and the time zone", async () => {
    vi.mocked(requireOrgRole).mockResolvedValue({ user: MANAGER, role: "manager" });
    updateOrganization.mockResolvedValue({ id: ORG_ID });

    const result = await updateOrganizationAction(
      ORG_ID,
      null,
      formWith({ description: "Ahora salimos los jueves", timezone: "Europe/London" })
    );

    expect(result).toEqual({ success: true });
    expect(requireOrgRole).toHaveBeenCalledWith(ORG_ID, ORG_ROLES["organization.updateDescription"]);
    expect(updateOrganization).toHaveBeenCalledWith(ORG_ID, {
      description: "Ahora salimos los jueves",
      timezone: "Europe/London",
    });
  });

  it("removes the description when the field is sent empty", async () => {
    vi.mocked(requireOrgRole).mockResolvedValue({ user: MANAGER, role: "manager" });
    updateOrganization.mockResolvedValue({ id: ORG_ID });

    await updateOrganizationAction(ORG_ID, null, formWith({ description: "  ", timezone: "Europe/Madrid" }));

    expect(updateOrganization).toHaveBeenCalledWith(ORG_ID, { description: null, timezone: "Europe/Madrid" });
  });

  it("propagates the rejection of an Athlete and does not update", async () => {
    vi.mocked(requireOrgRole).mockRejectedValue(new ForbiddenSignal());

    await expect(
      updateOrganizationAction(ORG_ID, null, formWith({ description: "x", timezone: "Europe/Madrid" }))
    ).rejects.toBeInstanceOf(ForbiddenSignal);

    expect(updateOrganization).not.toHaveBeenCalled();
  });

  it("propagates the rejection of a non-member and does not update", async () => {
    vi.mocked(requireOrgRole).mockRejectedValue(new NotFoundSignal());

    await expect(
      updateOrganizationAction(ORG_ID, null, formWith({ description: "x", timezone: "Europe/Madrid" }))
    ).rejects.toBeInstanceOf(NotFoundSignal);

    expect(updateOrganization).not.toHaveBeenCalled();
  });

  it("translates a ZodError from the service into a controlled error", async () => {
    vi.mocked(requireOrgRole).mockResolvedValue({ user: MANAGER, role: "manager" });
    updateOrganization.mockRejectedValue(new ZodError([]));

    const result = await updateOrganizationAction(
      ORG_ID,
      null,
      formWith({ description: "x", timezone: "Europe/Madrid" })
    );

    expect(result).toEqual({ success: false, error: "Descripción o zona horaria no válidas" });
  });

  it("passes a missing description as undefined, not null, and returns the controlled error", async () => {
    vi.mocked(requireOrgRole).mockResolvedValue({ user: MANAGER, role: "manager" });
    // The real schema rejects undefined; here the service contract is simulated
    updateOrganization.mockRejectedValue(new ZodError([]));

    const result = await updateOrganizationAction(ORG_ID, null, formWith({ timezone: "Europe/Madrid" }));

    expect(result).toEqual({ success: false, error: "Descripción o zona horaria no válidas" });
    expect(updateOrganization).toHaveBeenCalledWith(ORG_ID, { description: undefined, timezone: "Europe/Madrid" });
    expect(updateOrganization.mock.calls[0][1].description).not.toBeNull();
  });
});

describe("createOrganizationAction", () => {
  const NEW_CLUB_FORM = {
    name: "Club nuevo",
    description: "Salimos los viernes",
    timezone: "Europe/Madrid",
    managerIds: [MANAGER_A, MANAGER_B],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN);
  });

  it("creates the club with the Admin from the session and the form fields, and returns its id", async () => {
    createOrganization.mockResolvedValue({ id: ORG_ID });

    const result = await createOrganizationAction(null, formWith(NEW_CLUB_FORM));

    expect(result).toEqual({ success: true, orgId: ORG_ID });
    expect(createOrganization).toHaveBeenCalledWith("admin-from-session", {
      name: "Club nuevo",
      description: "Salimos los viernes",
      timezone: "Europe/Madrid",
      managerIds: [MANAGER_A, MANAGER_B],
    });
  });

  it("ignores an adminId or role sent in the form", async () => {
    createOrganization.mockResolvedValue({ id: ORG_ID });

    await createOrganizationAction(
      null,
      formWith({ ...NEW_CLUB_FORM, adminId: "someone-else", roleGlobal: "admin" })
    );

    expect(createOrganization).toHaveBeenCalledTimes(1);
    const [actorId, input] = createOrganization.mock.calls[0];
    expect(actorId).toBe("admin-from-session");
    expect(input).not.toHaveProperty("adminId");
    expect(input).not.toHaveProperty("roleGlobal");
  });

  it("propagates the authorization rejection and does not create", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenSignal());

    await expect(createOrganizationAction(null, formWith(NEW_CLUB_FORM))).rejects.toBeInstanceOf(ForbiddenSignal);

    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("passes one managerIds entry as a one-item list", async () => {
    createOrganization.mockResolvedValue({ id: ORG_ID });

    await createOrganizationAction(null, formWith({ ...NEW_CLUB_FORM, managerIds: MANAGER_A }));

    expect(createOrganization.mock.calls[0][1].managerIds).toEqual([MANAGER_A]);
  });

  it("passes an empty description as null and a missing one as undefined", async () => {
    createOrganization.mockResolvedValue({ id: ORG_ID });

    await createOrganizationAction(null, formWith({ ...NEW_CLUB_FORM, description: " " }));
    await createOrganizationAction(
      null,
      formWith({ name: "Club nuevo", timezone: "Europe/Madrid", managerIds: MANAGER_A })
    );

    expect(createOrganization.mock.calls[0][1].description).toBeNull();
    expect(createOrganization.mock.calls[1][1].description).toBeUndefined();
  });

  it("passes missing name and time zone as undefined and no Managers as an empty list", async () => {
    createOrganization.mockRejectedValue(new ZodError([]));

    await createOrganizationAction(null, formWith({ description: "x" }));

    expect(createOrganization).toHaveBeenCalledWith("admin-from-session", {
      name: undefined,
      description: "x",
      timezone: undefined,
      managerIds: [],
    });
  });

  it.each([
    ["invalid data (ZodError)", new ZodError([]), "Datos del club no válidos"],
    ["a taken name", new OrganizationNameTakenError(), "Ya existe un club con ese nombre"],
    ["the Admin naming themselves Manager", new AdminCannotBeManagerError(), "El Admin no puede ser Manager del club"],
  ])("translates %s into a controlled error", async (_label, error, message) => {
    createOrganization.mockRejectedValue(error);

    const result = await createOrganizationAction(null, formWith(NEW_CLUB_FORM));

    expect(result).toEqual({ success: false, error: message });
  });

  it("propagates an unexpected error instead of hiding it", async () => {
    const unexpected = new Error("connection lost");
    createOrganization.mockRejectedValue(unexpected);

    await expect(createOrganizationAction(null, formWith(NEW_CLUB_FORM))).rejects.toBe(unexpected);
  });
});

// Errors both operations can raise: the repository locks the user, then the club, in each
const COMMON_MANAGER_ERRORS = [
  ["a user that does not exist", new UserNotFoundError(), "El usuario no existe"],
  ["a club that does not exist", new OrganizationNotFoundError(), "El club ya no existe"],
] as const;

describe.each([
  [
    "assignManagerAction",
    assignManagerAction,
    assignManager,
    [
      ["the Admin as Manager", new AdminCannotBeManagerError(), "El Admin no puede ser Manager del club"],
      ["a user who is already Manager", new AlreadyManagerError(), "El usuario ya es Manager del club"],
    ],
  ],
  [
    "removeManagerAction",
    removeManagerAction,
    removeManager,
    [
      ["a user who is not Manager", new NotManagerError(), "El usuario no es Manager del club"],
      ["the last Manager", new LastManagerError(), "El club no puede quedarse sin Manager"],
    ],
  ],
] as const)("%s", (_name, action, serviceMethod, ownErrors) => {
  const USER_ID = MANAGER_A;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN);
  });

  it("calls the service with the Admin from the session, the club and the user", async () => {
    serviceMethod.mockResolvedValue(undefined);

    const result = await action(ORG_ID, null, formWith({ userId: USER_ID, adminId: "someone-else" }));

    expect(result).toEqual({ success: true });
    expect(serviceMethod).toHaveBeenCalledWith("admin-from-session", ORG_ID, USER_ID);
  });

  it("propagates the authorization rejection and does not call the service", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new ForbiddenSignal());

    await expect(action(ORG_ID, null, formWith({ userId: USER_ID }))).rejects.toBeInstanceOf(ForbiddenSignal);

    expect(serviceMethod).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", new FormData()],
    ["empty", formWith({ userId: "" })],
    ["not a guid", formWith({ userId: "not-a-uuid" })],
    ["a file", fileForm("userId")],
  ])("rejects a userId that is %s without calling the service", async (_label, form) => {
    const result = await action(ORG_ID, null, form);

    expect(result).toEqual({ success: false, error: "Usuario no válido" });
    expect(serviceMethod).not.toHaveBeenCalled();
  });

  it("rejects a malformed club id without calling the service", async () => {
    const result = await action("not-a-uuid", null, formWith({ userId: USER_ID }));

    expect(result).toEqual({ success: false, error: "Club no válido" });
    expect(serviceMethod).not.toHaveBeenCalled();
  });

  it.each([...ownErrors, ...COMMON_MANAGER_ERRORS])(
    "translates %s into a controlled error",
    async (_label, error, message) => {
      serviceMethod.mockRejectedValue(error);

      const result = await action(ORG_ID, null, formWith({ userId: USER_ID }));

      expect(result).toEqual({ success: false, error: message });
    }
  );

  it("propagates an unexpected database error instead of turning it into a domain error", async () => {
    const unexpected = Object.assign(new Error("invalid input syntax for type uuid"), { code: "P2010" });
    serviceMethod.mockRejectedValue(unexpected);

    await expect(action(ORG_ID, null, formWith({ userId: USER_ID }))).rejects.toBe(unexpected);
  });
});
