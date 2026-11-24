import "server-only";
import { notFound } from "next/navigation";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { requireAuth } from "@/lib/permissions/require-auth";
import { requireOrgRole } from "@/lib/permissions/require-org-role";
import { prisma } from "@/lib/prisma";
import { trainingRepository } from "./prisma-training-repository";
import { TrainingService } from "./training-service";
import type { TrainingTemplateData } from "./types";

export interface ClubOption {
  id: string;
  name: string;
}

export interface GroupOption {
  id: string;
  name: string;
  level: string | null;
  objective: string | null;
}

export type TrainingPageData =
  | { status: "no-club" }
  | {
      status: "ready";
      clubs: ClubOption[];
      activeClub: ClubOption;
      role: "manager" | "athlete";
      templates: TrainingTemplateData[];
      groups: GroupOption[];
    };

const trainingService = new TrainingService(trainingRepository);

function normalizeOrgIdParam(orgIdParam?: string | string[]): string | undefined {
  const raw = Array.isArray(orgIdParam) ? orgIdParam[0] : orgIdParam;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

async function requireTemplateReadRole(orgId: string): Promise<"manager" | "athlete"> {
  const { role } = await requireOrgRole(orgId, ORG_ROLES["trainingTemplate.read"]);
  if (role === "admin") {
    notFound();
  }
  return role;
}

export async function getTrainingPageData(
  orgIdParam?: string | string[],
): Promise<TrainingPageData> {
  const user = await requireAuth();
  const requestedOrgId = normalizeOrgIdParam(orgIdParam);

  let activeOrgId = requestedOrgId;
  let checkedRole: "manager" | "athlete" | undefined;

  if (activeOrgId) {
    checkedRole = await requireTemplateReadRole(activeOrgId);
  }

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    select: {
      orgId: true,
      role: true,
      organization: { select: { name: true } },
    },
    orderBy: { organization: { name: "asc" } },
  });

  if (memberships.length === 0) {
    return { status: "no-club" };
  }

  const clubs: ClubOption[] = memberships.map((m) => ({
    id: m.orgId,
    name: m.organization.name,
  }));

  if (!activeOrgId) {
    activeOrgId = clubs[0].id;
    checkedRole = await requireTemplateReadRole(activeOrgId);
  }

  const activeClub =
    clubs.find((c) => c.id.toLowerCase() === activeOrgId.toLowerCase()) ?? clubs[0];
  const role = checkedRole ?? "athlete";

  const [templates, groups] = await Promise.all([
    trainingService.listTemplates(user.id, activeClub.id),
    role === "manager"
      ? prisma.group.findMany({
          where: { orgId: activeClub.id },
          select: { id: true, name: true, level: true, objective: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  return {
    status: "ready",
    clubs,
    activeClub,
    role,
    templates,
    groups,
  };
}
