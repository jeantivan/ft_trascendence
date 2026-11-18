import type { SessionType, MembershipRole } from "@/generated/prisma/client";

export interface TemplateSessionData {
  sessionType: SessionType;
  dayOffset: number;
  position: number;
  targetDistanceM?: number | null;
  targetDurationS?: number | null;
  targetPaceSPerKm?: number | null;
}

export interface TrainingTemplateData {
  id: string;
  orgId: string;
  name: string;
  createdBy: string | null;
  sessions: TemplateSessionData[];
}

export interface CreateTrainingTemplateInput {
  orgId: string;
  name: string;
  createdBy: string;
  sessions: Omit<TemplateSessionData, "position">[];
}

export interface UpdateTrainingTemplateInput {
  name?: string;
  sessions?: Omit<TemplateSessionData, "position">[];
}

export interface TrainingNotificationPayload {
  orgId: string;
  templateId: string;
  action: "created" | "updated" | "deleted";
  actorId: string;
  recipientIds: string[];
}

export type TrainingNotificationPublisher = (
  payload: TrainingNotificationPayload,
  tx?: unknown
) => Promise<void>;

export type TrainingMutationCallback = (
  templateId: string,
  tx?: unknown
) => Promise<void>;

export interface TrainingRepository {
  findRole(orgId: string, userId: string): Promise<MembershipRole | null>;
  findOtherManagerIds(
    orgId: string,
    excludeUserId: string,
    tx?: unknown
  ): Promise<string[]>;
  findById(id: string): Promise<TrainingTemplateData | null>;
  listForManager(orgId: string): Promise<TrainingTemplateData[]>;
  listForAthlete(orgId: string, athleteId: string): Promise<TrainingTemplateData[]>;
  create(
    input: CreateTrainingTemplateInput,
    afterWrite?: TrainingMutationCallback
  ): Promise<TrainingTemplateData>;
  update(
    id: string,
    input: UpdateTrainingTemplateInput,
    afterWrite?: TrainingMutationCallback
  ): Promise<TrainingTemplateData>;
  delete(id: string, afterWrite?: TrainingMutationCallback): Promise<void>;
}
