import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalog, getMyClubs, getMyMembershipRequests, getOrganizationPage, userHasClub } from "@/lib/org/queries";
import { OrganizationNotFoundError } from "@/lib/org/organization-service";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { requireAuth } from "@/lib/permissions/require-auth";
import { requireOrgRole } from "@/lib/permissions/require-org-role";

const listCatalog = vi.hoisted(() => vi.fn());
const getOrganization = vi.hoisted(() => vi.fn());
const listUserRequests = vi.hoisted(() => vi.fn());
const hasClub = vi.hoisted(() => vi.fn());
const listUserClubs = vi.hoisted(() => vi.fn());

// The real "server-only" throws outside a server bundle, as in Vitest: replaced by an empty module
vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/permissions/require-org-role", () => ({ requireOrgRole: vi.fn() }));
// Like Next's notFound(), which throws to stop rendering; here any thrown error stands for it
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new NotFoundSignal();
  }),
}));
// Real error classes, fake service: these tests check the permission call, what is returned and
// that a rejection stops before the service. The real 404/403/redirect of Next is not run here
vi.mock("@/lib/org/organization-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/org/organization-service")>()),
  OrganizationService: class {
    listCatalog = listCatalog;
    getOrganization = getOrganization;
    listUserRequests = listUserRequests;
    hasClub = hasClub;
    listUserClubs = listUserClubs;
  },
}));

class RejectionSignal extends Error {}
class NotFoundSignal extends Error {}

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER = { id: "user-from-session", email: "u@b.c", nick: "Uno", roleGlobal: "user" as const };
const CLUB = { id: ORG_ID, name: "Club de prueba", description: "Salimos los martes", timezone: "Europe/Madrid" };

describe("getCatalog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("checks the session and returns what the service lists", async () => {
    vi.mocked(requireAuth).mockResolvedValue(USER);
    const catalog = [{ id: ORG_ID, name: CLUB.name, description: CLUB.description, memberCount: 3 }];
    listCatalog.mockResolvedValue(catalog);

    await expect(getCatalog()).resolves.toBe(catalog);

    expect(requireAuth).toHaveBeenCalledTimes(1);
  });

  it("propagates the rejection of requireAuth and does not call the service", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new RejectionSignal());

    await expect(getCatalog()).rejects.toBeInstanceOf(RejectionSignal);

    expect(listCatalog).not.toHaveBeenCalled();
  });
});

describe("getOrganizationPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("checks the read permission of the club and returns what the service gives", async () => {
    vi.mocked(requireOrgRole).mockResolvedValue({ user: USER, role: "athlete" });
    getOrganization.mockResolvedValue(CLUB);

    await expect(getOrganizationPage(ORG_ID)).resolves.toBe(CLUB);

    expect(requireOrgRole).toHaveBeenCalledWith(ORG_ID, ORG_ROLES["organization.read"]);
    expect(getOrganization).toHaveBeenCalledWith(ORG_ID);
  });

  it("propagates the rejection of requireOrgRole and does not call the service", async () => {
    vi.mocked(requireOrgRole).mockRejectedValue(new RejectionSignal());

    await expect(getOrganizationPage(ORG_ID)).rejects.toBeInstanceOf(RejectionSignal);

    expect(getOrganization).not.toHaveBeenCalled();
  });

  it("ends in notFound when the club disappears after the permission check", async () => {
    vi.mocked(requireOrgRole).mockResolvedValue({ user: USER, role: "manager" });
    getOrganization.mockRejectedValue(new OrganizationNotFoundError());

    await expect(getOrganizationPage(ORG_ID)).rejects.toBeInstanceOf(NotFoundSignal);
  });

  it("propagates an unexpected error instead of hiding it", async () => {
    vi.mocked(requireOrgRole).mockResolvedValue({ user: USER, role: "manager" });
    const unexpected = new Error("connection lost");
    getOrganization.mockRejectedValue(unexpected);

    await expect(getOrganizationPage(ORG_ID)).rejects.toBe(unexpected);
  });
});

describe("getMyMembershipRequests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const row = (id: string, kind: "invite" | "request", status: "pending" | "rejected") => ({
    id,
    orgId: ORG_ID,
    orgName: CLUB.name,
    kind,
    status,
    createdAt: new Date("2026-11-24T10:00:00Z"),
  });

  it("asks for the session user's rows and splits pending invitations from sent requests", async () => {
    vi.mocked(requireAuth).mockResolvedValue(USER);
    const invitation = row("a", "invite", "pending");
    const answeredInvitation = row("b", "invite", "rejected");
    const pending = row("c", "request", "pending");
    const rejected = row("d", "request", "rejected");
    listUserRequests.mockResolvedValue([invitation, answeredInvitation, pending, rejected]);

    await expect(getMyMembershipRequests()).resolves.toEqual({
      invitations: [invitation],
      sentRequests: [pending, rejected],
    });

    expect(listUserRequests).toHaveBeenCalledWith(USER.id);
  });

  it("propagates the rejection of requireAuth and does not call the service", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new RejectionSignal());

    await expect(getMyMembershipRequests()).rejects.toBeInstanceOf(RejectionSignal);

    expect(listUserRequests).not.toHaveBeenCalled();
  });
});

describe("userHasClub", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("asks the service about the session user", async () => {
    vi.mocked(requireAuth).mockResolvedValue(USER);
    hasClub.mockResolvedValue(true);

    await expect(userHasClub()).resolves.toBe(true);

    expect(hasClub).toHaveBeenCalledWith(USER.id);
  });

  it("propagates the rejection of requireAuth and does not call the service", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new RejectionSignal());

    await expect(userHasClub()).rejects.toBeInstanceOf(RejectionSignal);

    expect(hasClub).not.toHaveBeenCalled();
  });
});

describe("getMyClubs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("asks the service for the session user's clubs", async () => {
    const clubs = [{ orgId: ORG_ID, name: "Club de prueba", role: "manager", isLastManager: true }];
    vi.mocked(requireAuth).mockResolvedValue(USER);
    listUserClubs.mockResolvedValue(clubs);

    await expect(getMyClubs()).resolves.toEqual(clubs);

    expect(listUserClubs).toHaveBeenCalledWith(USER.id);
  });

  it("propagates the rejection of requireAuth and does not call the service", async () => {
    vi.mocked(requireAuth).mockRejectedValue(new RejectionSignal());

    await expect(getMyClubs()).rejects.toBeInstanceOf(RejectionSignal);

    expect(listUserClubs).not.toHaveBeenCalled();
  });
});
