import { randomUUID } from "node:crypto";
import type { MembershipRole, Prisma } from "@/generated/prisma/client";
import { normalizeId } from "@/lib/org/schemas";
import { TrainingNotFoundError } from "@/lib/training/errors";
import type {
  TrainingRepository,
  TrainingTemplateData,
  TemplateSessionData,
  CreateTrainingTemplateInput,
  UpdateTrainingTemplateInput,
  TrainingMutationCallback,
} from "@/lib/training/types";

export const IN_MEMORY_TX_TOKEN = Symbol(
  "in-memory-tx"
) as unknown as Prisma.TransactionClient;

export class InMemoryTrainingRepository implements TrainingRepository {
  private templates: Map<string, TrainingTemplateData> = new Map();
  private memberships: Map<string, MembershipRole> = new Map();
  private athleteGroups: Map<string, Set<string>> = new Map();
  private groupTemplates: Map<string, Set<string>> = new Map();
  public copiedSessions: Array<{
    id: string;
    sourceTemplateId: string | null;
    groupId?: string;
    sessionType?: TemplateSessionData["sessionType"];
    dayOffset?: number;
    targetDistanceM?: number | null;
  }> = [];

  addMember(orgId: string, userId: string, role: MembershipRole): void {
    this.memberships.set(`${normalizeId(orgId)}:${normalizeId(userId)}`, role);
  }

  addAthleteToGroup(athleteId: string, groupId: string): void {
    const normalizedAthleteId = normalizeId(athleteId);
    const groups = this.athleteGroups.get(normalizedAthleteId) ?? new Set();
    groups.add(normalizeId(groupId));
    this.athleteGroups.set(normalizedAthleteId, groups);
  }

  assignTemplateToGroup(groupId: string, templateId: string): void {
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
}
