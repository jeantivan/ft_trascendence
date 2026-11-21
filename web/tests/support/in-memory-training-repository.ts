import { randomUUID } from "node:crypto";
import type { MembershipRole } from "@/generated/prisma/client";
import type {
  TrainingRepository,
  TrainingTemplateData,
  TemplateSessionData,
  CreateTrainingTemplateInput,
  UpdateTrainingTemplateInput,
  TrainingMutationCallback,
} from "@/lib/training/types";

export const IN_MEMORY_TX_TOKEN = Symbol("in-memory-tx");

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
    this.memberships.set(`${orgId}:${userId}`, role);
  }

  addAthleteToGroup(athleteId: string, groupId: string): void {
    const groups = this.athleteGroups.get(athleteId) ?? new Set();
    groups.add(groupId);
    this.athleteGroups.set(athleteId, groups);
  }

  assignTemplateToGroup(groupId: string, templateId: string): void {
    const templates = this.groupTemplates.get(groupId) ?? new Set();
    templates.add(templateId);
    this.groupTemplates.set(groupId, templates);
    const template = this.templates.get(templateId);
    if (template && template.sessions.length > 0) {
      for (const s of template.sessions) {
        this.copiedSessions.push({
          id: randomUUID(),
          sourceTemplateId: templateId,
          groupId,
          sessionType: s.sessionType,
          dayOffset: s.dayOffset,
          targetDistanceM: s.targetDistanceM ?? null,
        });
      }
    } else {
      this.copiedSessions.push({ id: randomUUID(), sourceTemplateId: templateId, groupId });
    }
  }

  async findRole(orgId: string, userId: string): Promise<MembershipRole | null> {
    return this.memberships.get(`${orgId}:${userId}`) ?? null;
  }

  async findOtherManagerIds(orgId: string, excludeUserId: string): Promise<string[]> {
    const managers: string[] = [];
    for (const [key, role] of this.memberships.entries()) {
      if (role === "manager") {
        const [mOrgId, mUserId] = key.split(":");
        if (mOrgId === orgId && mUserId !== excludeUserId) {
          managers.push(mUserId);
        }
      }
    }
    return managers;
  }

  async findById(id: string): Promise<TrainingTemplateData | null> {
    const template = this.templates.get(id);
    if (!template) return null;
    return {
      ...template,
      sessions: [...template.sessions].sort((a, b) => a.position - b.position),
    };
  }

  async listForManager(orgId: string): Promise<TrainingTemplateData[]> {
    const list: TrainingTemplateData[] = [];
    for (const template of this.templates.values()) {
      if (template.orgId === orgId) {
        list.push({
          ...template,
          sessions: [...template.sessions].sort((a, b) => a.position - b.position),
        });
      }
    }
    return list;
  }

  async listForAthlete(orgId: string, athleteId: string): Promise<TrainingTemplateData[]> {
    const athleteGroups = this.athleteGroups.get(athleteId) ?? new Set();
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
      if (template.orgId === orgId && visibleTemplateIds.has(template.id)) {
        list.push({
          ...template,
          sessions: [...template.sessions].sort((a, b) => a.position - b.position),
        });
      }
    }
    return list;
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
      orgId: input.orgId,
      name: input.name,
      createdBy: input.createdBy,
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
    id: string,
    input: UpdateTrainingTemplateInput,
    afterWrite?: TrainingMutationCallback
  ): Promise<TrainingTemplateData> {
    const existing = this.templates.get(id);
    if (!existing) {
      throw new Error(`Template not found: ${id}`);
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
    this.templates.set(id, updated);
    try {
      await afterWrite?.(id, IN_MEMORY_TX_TOKEN);
    } catch (error) {
      this.templates.set(id, existing);
      throw error;
    }
    return { ...updated };
  }

  async delete(id: string, afterWrite?: TrainingMutationCallback): Promise<void> {
    const existing = this.templates.get(id);
    const affectedSessionIndices: number[] = [];
    this.templates.delete(id);
    this.copiedSessions.forEach((session, idx) => {
      if (session.sourceTemplateId === id) {
        affectedSessionIndices.push(idx);
        session.sourceTemplateId = null;
      }
    });
    try {
      await afterWrite?.(id, IN_MEMORY_TX_TOKEN);
    } catch (error) {
      if (existing) {
        this.templates.set(id, existing);
      }
      for (const idx of affectedSessionIndices) {
        this.copiedSessions[idx].sourceTemplateId = id;
      }
      throw error;
    }
  }
}
