import { randomUUID } from "node:crypto";
import type { MembershipRole, Prisma } from "@/generated/prisma/client";
import { normalizeId } from "@/lib/org/schemas";
import { TrainingConflictError, TrainingNotFoundError } from "@/lib/training/errors";
import { computeScheduledAtUtc } from "@/lib/training/units";
import type {
  AssignTrainingTemplateInput,
  CreateTrainingTemplateInput,
  TemplateSessionData,
  TrainingAssignCallback,
  TrainingMutationCallback,
  TrainingRepository,
  TrainingSessionData,
  TrainingTemplateData,
  UpdateTrainingTemplateInput,
} from "@/lib/training/types";

export const IN_MEMORY_TX_TOKEN = Symbol(
  "in-memory-tx"
) as unknown as Prisma.TransactionClient;

export class InMemoryTrainingRepository implements TrainingRepository {
  private templates: Map<string, TrainingTemplateData> = new Map();
  private memberships: Map<string, MembershipRole> = new Map();
  private orgTimezones: Map<string, string> = new Map();
  private groups: Map<string, string> = new Map();
  private athleteGroups: Map<string, Set<string>> = new Map();
  private groupTemplates: Map<string, Set<string>> = new Map();
  public copiedSessions: Array<{
    id: string;
    orgId?: string;
    origin?: "template" | "customized" | "free";
    sourceTemplateId: string | null;
    groupId?: string | null;
    athleteId?: string | null;
    sessionType?: TemplateSessionData["sessionType"];
    dayOffset?: number;
    targetDistanceM?: number | null;
    targetDurationS?: number | null;
    targetPaceSPerKm?: number | null;
    scheduledAt?: Date;
  }> = [];

  addOrganization(orgId: string, timezone = "Europe/Madrid"): void {
    this.orgTimezones.set(normalizeId(orgId), timezone);
  }

  addGroup(orgId: string, groupId: string): void {
    this.groups.set(normalizeId(groupId), normalizeId(orgId));
  }

  addMember(orgId: string, userId: string, role: MembershipRole): void {
    this.memberships.set(`${normalizeId(orgId)}:${normalizeId(userId)}`, role);
  }

  addAthleteToGroup(athleteId: string, groupId: string): void {
    const normalizedAthleteId = normalizeId(athleteId);
    const groups = this.athleteGroups.get(normalizedAthleteId) ?? new Set();
    groups.add(normalizeId(groupId));
    this.athleteGroups.set(normalizedAthleteId, groups);
  }

  seedTemplateAssignment(groupId: string, templateId: string): void {
    const normalizedGroupId = normalizeId(groupId);
    const normalizedTemplateId = normalizeId(templateId);
    const templates = this.groupTemplates.get(normalizedGroupId) ?? new Set();
    templates.add(normalizedTemplateId);
    this.groupTemplates.set(normalizedGroupId, templates);
    const template = this.templates.get(normalizedTemplateId);
    if (template && template.sessions.length > 0) {
      for (const s of template.sessions) {
        this.copiedSessions.push({
          id: randomUUID(),
          sourceTemplateId: normalizedTemplateId,
          groupId: normalizedGroupId,
          sessionType: s.sessionType,
          dayOffset: s.dayOffset,
          targetDistanceM: s.targetDistanceM ?? null,
        });
      }
    } else {
      this.copiedSessions.push({
        id: randomUUID(),
        sourceTemplateId: normalizedTemplateId,
        groupId: normalizedGroupId,
      });
    }
  }

  async findRole(orgId: string, userId: string): Promise<MembershipRole | null> {
    return (
      this.memberships.get(`${normalizeId(orgId)}:${normalizeId(userId)}`) ??
      null
    );
  }

  async findOtherManagerIds(
    orgId: string,
    excludeUserId: string
  ): Promise<string[]> {
    const normalizedOrgId = normalizeId(orgId);
    const normalizedExcludeId = normalizeId(excludeUserId);
    const managers: string[] = [];
    for (const [key, role] of this.memberships.entries()) {
      if (role === "manager") {
        const [mOrgId, mUserId] = key.split(":");
        if (mOrgId === normalizedOrgId && mUserId !== normalizedExcludeId) {
          managers.push(mUserId);
        }
      }
    }
    return managers;
  }

  async findById(id: string): Promise<TrainingTemplateData | null> {
    const template = this.templates.get(normalizeId(id));
    if (!template) return null;
    return {
      ...template,
      sessions: [...template.sessions].sort((a, b) => a.position - b.position),
    };
  }

  async listForManager(orgId: string): Promise<TrainingTemplateData[]> {
    const normalizedOrgId = normalizeId(orgId);
    const list: TrainingTemplateData[] = [];
    for (const template of this.templates.values()) {
      if (template.orgId === normalizedOrgId) {
        list.push({
          ...template,
          sessions: [...template.sessions].sort((a, b) => a.position - b.position),
        });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listForAthlete(orgId: string, athleteId: string): Promise<TrainingTemplateData[]> {
    const normalizedOrgId = normalizeId(orgId);
    const athleteGroups =
      this.athleteGroups.get(normalizeId(athleteId)) ?? new Set();
    const visibleTemplateIds = new Set<string>();
    for (const groupId of athleteGroups) {
      const templates = this.groupTemplates.get(groupId);
      if (templates) {
        for (const tId of templates) {
          visibleTemplateIds.add(tId);
        }
      }
    }

    const list: TrainingTemplateData[] = [];
    for (const template of this.templates.values()) {
      if (
        template.orgId === normalizedOrgId &&
        visibleTemplateIds.has(template.id)
      ) {
        list.push({
          ...template,
          sessions: [...template.sessions].sort((a, b) => a.position - b.position),
        });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(
    input: CreateTrainingTemplateInput,
    afterWrite?: TrainingMutationCallback
  ): Promise<TrainingTemplateData> {
    const id = randomUUID();
    const sessions: TemplateSessionData[] = input.sessions.map((s, index) => ({
      ...s,
      position: index,
    }));
    const record: TrainingTemplateData = {
      id,
      orgId: normalizeId(input.orgId),
      name: input.name,
      createdBy: normalizeId(input.createdBy),
      sessions,
    };
    this.templates.set(id, record);
    try {
      await afterWrite?.(id, IN_MEMORY_TX_TOKEN);
    } catch (error) {
      this.templates.delete(id);
      throw error;
    }
    return { ...record };
  }

  async update(
    orgId: string,
    id: string,
    input: UpdateTrainingTemplateInput,
    afterWrite?: TrainingMutationCallback
  ): Promise<TrainingTemplateData> {
    const normalizedOrgId = normalizeId(orgId);
    const normalizedId = normalizeId(id);
    const existing = this.templates.get(normalizedId);
    if (!existing || existing.orgId !== normalizedOrgId) {
      throw new TrainingNotFoundError();
    }
    const name = input.name ?? existing.name;
    const sessions: TemplateSessionData[] = input.sessions
      ? input.sessions.map((s, index) => ({ ...s, position: index }))
      : existing.sessions;

    const updated: TrainingTemplateData = {
      ...existing,
      name,
      sessions,
    };
    this.templates.set(normalizedId, updated);
    try {
      await afterWrite?.(normalizedId, IN_MEMORY_TX_TOKEN);
    } catch (error) {
      this.templates.set(normalizedId, existing);
      throw error;
    }
    return { ...updated };
  }

  async delete(
    orgId: string,
    id: string,
    afterWrite?: TrainingMutationCallback
  ): Promise<void> {
    const normalizedOrgId = normalizeId(orgId);
    const normalizedId = normalizeId(id);
    const existing = this.templates.get(normalizedId);
    if (!existing || existing.orgId !== normalizedOrgId) {
      throw new TrainingNotFoundError();
    }
    const affectedSessionIndices: number[] = [];
    this.templates.delete(normalizedId);
    this.copiedSessions.forEach((session, idx) => {
      if (session.sourceTemplateId === normalizedId) {
        affectedSessionIndices.push(idx);
        session.sourceTemplateId = null;
      }
    });
    try {
      await afterWrite?.(normalizedId, IN_MEMORY_TX_TOKEN);
    } catch (error) {
      this.templates.set(normalizedId, existing);
      for (const idx of affectedSessionIndices) {
        this.copiedSessions[idx].sourceTemplateId = normalizedId;
      }
      throw error;
    }
  }

  async assignTemplateToGroup(
    input: AssignTrainingTemplateInput,
    afterAssign?: TrainingAssignCallback
  ): Promise<TrainingSessionData[]> {
    const normalizedOrgId = normalizeId(input.orgId);
    const normalizedTemplateId = normalizeId(input.templateId);
    const normalizedGroupId = normalizeId(input.groupId);

    const template = this.templates.get(normalizedTemplateId);
    if (!template || template.orgId !== normalizedOrgId) {
      throw new TrainingNotFoundError();
    }
    if (this.groups.get(normalizedGroupId) !== normalizedOrgId) {
      throw new TrainingNotFoundError();
    }

    const timezone = this.orgTimezones.get(normalizedOrgId) ?? "Europe/Madrid";
    const sortedSessions = [...template.sessions].sort(
      (a, b) => a.position - b.position
    );
    const created: TrainingSessionData[] = sortedSessions.map((s) => ({
      id: randomUUID(),
      orgId: normalizedOrgId,
      origin: "template",
      sessionType: s.sessionType,
      targetDistanceM: s.targetDistanceM ?? null,
      targetDurationS: s.targetDurationS ?? null,
      targetPaceSPerKm: s.targetPaceSPerKm ?? null,
      scheduledAt: computeScheduledAtUtc(input.startDate, s.dayOffset, timezone),
      groupId: normalizedGroupId,
      athleteId: null,
      sourceTemplateId: normalizedTemplateId,
    }));

    if (created.length > 0) {
      const plannedCounts = new Map<string, number>();
      for (const session of created) {
        const key = `${session.scheduledAt.getTime()}:${session.sessionType}`;
        plannedCounts.set(key, (plannedCounts.get(key) ?? 0) + 1);
      }
      const existingCounts = new Map<string, number>();
      for (const session of this.copiedSessions) {
        if (
          session.orgId === normalizedOrgId &&
          session.groupId === normalizedGroupId &&
          session.sourceTemplateId === normalizedTemplateId &&
          session.origin === "template" &&
          session.scheduledAt &&
          session.sessionType
        ) {
          const key = `${session.scheduledAt.getTime()}:${session.sessionType}`;
          existingCounts.set(key, (existingCounts.get(key) ?? 0) + 1);
        }
      }
      let isDuplicate = true;
      for (const [key, requiredCount] of plannedCounts.entries()) {
        if ((existingCounts.get(key) ?? 0) < requiredCount) {
          isDuplicate = false;
          break;
        }
      }
      if (isDuplicate) {
        throw new TrainingConflictError();
      }
    }

    const athleteIds: string[] = [];
    for (const [athleteId, groups] of this.athleteGroups.entries()) {
      if (
        groups.has(normalizedGroupId) &&
        this.memberships.get(`${normalizedOrgId}:${athleteId}`) === "athlete"
      ) {
        athleteIds.push(athleteId);
      }
    }

    const prevLength = this.copiedSessions.length;
    const prevTemplates = new Set(
      this.groupTemplates.get(normalizedGroupId) ?? []
    );
    this.copiedSessions.push(...created);
    const templates = new Set(prevTemplates);
    templates.add(normalizedTemplateId);
    this.groupTemplates.set(normalizedGroupId, templates);

    try {
      await afterAssign?.(athleteIds, IN_MEMORY_TX_TOKEN);
    } catch (error) {
      this.copiedSessions.length = prevLength;
      this.groupTemplates.set(normalizedGroupId, prevTemplates);
      throw error;
    }

    return created.map((s) => ({ ...s }));
  }
}
