import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTrainingPageData } from "@/lib/training/queries";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { requireAuth } from "@/lib/permissions/require-auth";
import { requireOrgRole } from "@/lib/permissions/require-org-role";
import { prisma } from "@/lib/prisma";

const listTemplates = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/permissions/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/permissions/require-org-role", () => ({ requireOrgRole: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new NotFoundSignal();
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: { findMany: vi.fn() },
    group: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/training/training-service", () => ({
  TrainingService: class {
    listTemplates = listTemplates;
  },
}));

class NotFoundSignal extends Error {}

const USER = {
  id: "user-1",
  email: "runner@stridesync.es",
  nick: "Runner",
  roleGlobal: "user" as const,
};

const CLUB_A = { id: "11111111-1111-4111-8111-111111111111", name: "Club Alpha" };
const CLUB_B = { id: "22222222-2222-4222-8222-222222222222", name: "Club Beta" };

const TEMPLATE = {
  id: "tpl-1",
  orgId: CLUB_A.id,
  name: "Base 10K",
  createdBy: USER.id,
  sessions: [],
};

const GROUP = {
  id: "grp-1",
  name: "Avanzado 10K",
  level: "Avanzado",
  objective: "10K",
};

describe("getTrainingPageData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns no-club when the user belongs to no organization and no orgId is provided", async () => {
    vi.mocked(requireAuth).mockResolvedValue(USER);
    vi.mocked(prisma.membership.findMany).mockResolvedValue([]);

    const result = await getTrainingPageData();

    expect(result).toEqual({ status: "no-club" });
    expect(requireAuth).toHaveBeenCalledTimes(1);
    expect(prisma.membership.findMany).toHaveBeenCalledWith({
      where: { userId: USER.id },
      select: {
        orgId: true,
        organization: { select: { name: true, timezone: true } },
      },
      orderBy: { organization: { name: "asc" } },
    });
  });

  it("picks the first club by name ASC and loads templates and groups for a manager", async () => {
    vi.mocked(requireAuth).mockResolvedValue(USER);
    vi.mocked(prisma.membership.findMany).mockResolvedValue([
      { orgId: CLUB_A.id, organization: { name: CLUB_A.name, timezone: "Europe/Madrid" } },
      { orgId: CLUB_B.id, organization: { name: CLUB_B.name, timezone: "Europe/Madrid" } },
    ] as never);
    vi.mocked(requireOrgRole).mockResolvedValue({ user: USER, role: "manager" });
    listTemplates.mockResolvedValue([TEMPLATE]);
    vi.mocked(prisma.group.findMany).mockResolvedValue([GROUP] as never);

    const result = await getTrainingPageData();

    expect(requireOrgRole).toHaveBeenCalledWith(CLUB_A.id, ORG_ROLES["trainingTemplate.read"]);
    expect(listTemplates).toHaveBeenCalledWith(USER.id, CLUB_A.id);
    expect(prisma.group.findMany).toHaveBeenCalledWith({
      where: { orgId: CLUB_A.id },
      select: { id: true, name: true, level: true, objective: true },
      orderBy: { name: "asc" },
    });
    expect(result).toEqual({
      status: "ready",
      clubs: [
        { id: CLUB_A.id, name: CLUB_A.name },
        { id: CLUB_B.id, name: CLUB_B.name },
      ],
      activeClub: CLUB_A,
      role: "manager",
      templates: [TEMPLATE],
      groups: [GROUP],
      defaultStartDate: "2026-11-24",
    });
  });

  it("loads only templates (and no groups) when active role is athlete", async () => {
    vi.mocked(requireAuth).mockResolvedValue(USER);
    vi.mocked(prisma.membership.findMany).mockResolvedValue([
      { orgId: CLUB_B.id, organization: { name: CLUB_B.name, timezone: "Europe/Madrid" } },
    ] as never);
    vi.mocked(requireOrgRole).mockResolvedValue({ user: USER, role: "athlete" });
    listTemplates.mockResolvedValue([TEMPLATE]);

    const result = await getTrainingPageData(CLUB_B.id);

    expect(requireOrgRole).toHaveBeenCalledWith(CLUB_B.id, ORG_ROLES["trainingTemplate.read"]);
    expect(listTemplates).toHaveBeenCalledWith(USER.id, CLUB_B.id);
    expect(prisma.group.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "ready",
      clubs: [{ id: CLUB_B.id, name: CLUB_B.name }],
      activeClub: CLUB_B,
      role: "athlete",
      templates: [TEMPLATE],
      groups: [],
      defaultStartDate: "2026-11-24",
    });
  });

  it("computes defaultStartDate in the club timezone rather than UTC", async () => {
    // 23:30 UTC on Nov 24 is already 00:30 on Nov 25 in Europe/Madrid (CET, UTC+1)
    vi.setSystemTime(new Date("2026-11-24T23:30:00Z"));
    vi.mocked(requireAuth).mockResolvedValue(USER);
    vi.mocked(prisma.membership.findMany).mockResolvedValue([
      { orgId: CLUB_A.id, organization: { name: CLUB_A.name, timezone: "Europe/Madrid" } },
    ] as never);
    vi.mocked(requireOrgRole).mockResolvedValue({ user: USER, role: "manager" });
    listTemplates.mockResolvedValue([]);
    vi.mocked(prisma.group.findMany).mockResolvedValue([] as never);

    const result = await getTrainingPageData(CLUB_A.id.toUpperCase());

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.defaultStartDate).toBe("2026-11-25");
      expect(result.activeClub).toEqual(CLUB_A);
    }
  });

  it("calls notFound instead of falling back to clubs[0] if activeOrgId is missing from memberships", async () => {
    vi.mocked(requireAuth).mockResolvedValue(USER);
    vi.mocked(requireOrgRole).mockResolvedValue({ user: USER, role: "manager" });
    vi.mocked(prisma.membership.findMany).mockResolvedValue([
      { orgId: CLUB_A.id, organization: { name: CLUB_A.name, timezone: "Europe/Madrid" } },
    ] as never);

    await expect(getTrainingPageData(CLUB_B.id)).rejects.toBeInstanceOf(NotFoundSignal);
    expect(listTemplates).not.toHaveBeenCalled();
  });

  it("propagates notFound when an explicit orgId is invalid or belongs to another club", async () => {
    vi.mocked(requireAuth).mockResolvedValue(USER);
    vi.mocked(requireOrgRole).mockRejectedValue(new NotFoundSignal());

    await expect(getTrainingPageData("invalid-or-foreign-org")).rejects.toBeInstanceOf(NotFoundSignal);
    expect(requireOrgRole).toHaveBeenCalledWith(
      "invalid-or-foreign-org",
      ORG_ROLES["trainingTemplate.read"],
    );
    expect(listTemplates).not.toHaveBeenCalled();
  });

  it("returns no-club for a global admin without memberships and 404 when requesting an orgId", async () => {
    const admin = { ...USER, id: "admin-1", roleGlobal: "admin" as const };
    vi.mocked(requireAuth).mockResolvedValue(admin);
    vi.mocked(prisma.membership.findMany).mockResolvedValue([]);

    await expect(getTrainingPageData()).resolves.toEqual({ status: "no-club" });

    vi.mocked(requireOrgRole).mockRejectedValue(new NotFoundSignal());
    await expect(getTrainingPageData(CLUB_A.id)).rejects.toBeInstanceOf(NotFoundSignal);
    expect(requireOrgRole).toHaveBeenCalledWith(
      CLUB_A.id,
      ORG_ROLES["trainingTemplate.read"],
    );
  });
});
