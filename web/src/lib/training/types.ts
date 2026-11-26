import type {
  Prisma,
  SessionOrigin,
  SessionType,
  MembershipRole,
} from "@/generated/prisma/client";

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

export interface TrainingSessionData {
  id: string;
  orgId: string;
  origin: SessionOrigin;
  sessionType: SessionType;
  targetDistanceM: number | null;
  targetDurationS: number | null;
  targetPaceSPerKm: number | null;
  scheduledAt: Date;
  groupId: string | null;
  athleteId: string | null;
  sourceTemplateId: string | null;
  customizesSessionId: string | null;
}

export interface AssignTrainingTemplateInput {
  orgId: string;
  templateId: string;
  groupId: string;
  startDate: string;
}

export interface CreateCustomizedSessionInput {
  orgId: string;
  athleteId: string;
  customizesSessionId: string | null;
  sessionType: SessionType;
  scheduledAt: string;
  targetDistanceM: number | null;
  targetDurationS: number | null;
  targetPaceSPerKm: number | null;
}

export interface UpdateManagerSessionInput {
  sessionType?: SessionType;
  scheduledAt?: string;
  targetDistanceM?: number | null;
  targetDurationS?: number | null;
  targetPaceSPerKm?: number | null;
}

export const TRAINING_TEMPLATE_CREATED = "training_template_created";
export const TRAINING_TEMPLATE_UPDATED = "training_template_updated";
export const TRAINING_TEMPLATE_DELETED = "training_template_deleted";
export const TRAINING_TEMPLATE_ASSIGNED = "training_template_assigned";
export const TRAINING_SESSION_UPDATED = "training_session_updated";
export const TRAINING_SESSION_DELETED = "training_session_deleted";
export const CUSTOMIZED_SESSION_CREATED = "customized_session_created";
export const CUSTOMIZED_SESSION_UPDATED = "customized_session_updated";
export const CUSTOMIZED_SESSION_DELETED = "customized_session_deleted";

export type TrainingTemplateManagerNotificationType =
  | typeof TRAINING_TEMPLATE_CREATED
  | typeof TRAINING_TEMPLATE_UPDATED
  | typeof TRAINING_TEMPLATE_DELETED;

export type TrainingSessionGroupNotificationType =
  | typeof TRAINING_SESSION_UPDATED
  | typeof TRAINING_SESSION_DELETED;

export type CustomizedSessionNotificationType =
  | typeof CUSTOMIZED_SESSION_CREATED
  | typeof CUSTOMIZED_SESSION_UPDATED
  | typeof CUSTOMIZED_SESSION_DELETED;

export type TrainingNotificationType =
  | TrainingTemplateManagerNotificationType
  | typeof TRAINING_TEMPLATE_ASSIGNED
  | TrainingSessionGroupNotificationType
  | CustomizedSessionNotificationType;

export type TrainingNotifyInput =
  | {
      userId: string;
      type: TrainingTemplateManagerNotificationType;
      payload: {
        orgId: string;
        templateId: string;
      };
    }
  | {
      userId: string;
      type: typeof TRAINING_TEMPLATE_ASSIGNED;
      payload: {
        orgId: string;
        templateId: string;
        groupId: string;
      };
    }
  | {
      userId: string;
      type: TrainingSessionGroupNotificationType;
      payload: {
        orgId: string;
        sessionId: string;
        groupId: string;
      };
    }
  | {
      userId: string;
      type: CustomizedSessionNotificationType;
      payload: {
        orgId: string;
        sessionId: string;
        athleteId: string;
      };
    };

export type TrainingNotify = (
  tx: Prisma.TransactionClient,
  input: TrainingNotifyInput
) => Promise<bigint | null>;

// Runs inside the repository's $transaction so notifications commit or roll back atomically with the template write.
export type TrainingMutationCallback = (
  templateId: string,
  tx: Prisma.TransactionClient
) => Promise<void>;

export type TrainingAssignCallback = (
  athleteIds: string[],
  tx: Prisma.TransactionClient
) => Promise<void>;

export type CustomizedSessionCreateCallback = (
  sessionId: string,
  tx: Prisma.TransactionClient
) => Promise<void>;

export type TrainingSessionMutationTarget =
  | {
      kind: "group";
      sessionId: string;
      groupId: string;
      athleteIds: string[];
    }
  | {
      kind: "group_orphan";
      sessionId: string;
    }
  | {
      kind: "customized";
      sessionId: string;
      athleteId: string;
    };

export type TrainingSessionMutationCallback = (
  target: TrainingSessionMutationTarget,
  tx: Prisma.TransactionClient
) => Promise<void>;

export interface TrainingRepository {
  findRole(orgId: string, userId: string): Promise<MembershipRole | null>;
  findOtherManagerIds(
    orgId: string,
    excludeUserId: string,
    tx?: Prisma.TransactionClient
  ): Promise<string[]>;
  findById(id: string): Promise<TrainingTemplateData | null>;
  listForManager(orgId: string): Promise<TrainingTemplateData[]>;
  listForAthlete(orgId: string, athleteId: string): Promise<TrainingTemplateData[]>;
  create(
    input: CreateTrainingTemplateInput,
    afterWrite?: TrainingMutationCallback
  ): Promise<TrainingTemplateData>;
  update(
    orgId: string,
    id: string,
    input: UpdateTrainingTemplateInput,
    afterWrite?: TrainingMutationCallback
  ): Promise<TrainingTemplateData>;
  delete(
    orgId: string,
    id: string,
    afterWrite?: TrainingMutationCallback
  ): Promise<void>;
  assignTemplateToGroup(
    input: AssignTrainingTemplateInput,
    afterAssign?: TrainingAssignCallback
  ): Promise<TrainingSessionData[]>;
  getAthleteSchedule(
    orgId: string,
    athleteId: string
  ): Promise<TrainingSessionData[]>;
  listClubSessions(orgId: string): Promise<TrainingSessionData[]>;
  createCustomizedSession(
    input: CreateCustomizedSessionInput,
    afterCreate?: CustomizedSessionCreateCallback
  ): Promise<TrainingSessionData>;
  updateManagerSession(
    orgId: string,
    sessionId: string,
    input: UpdateManagerSessionInput,
    afterWrite?: TrainingSessionMutationCallback
  ): Promise<TrainingSessionData>;
  deleteManagerSession(
    orgId: string,
    sessionId: string,
    afterDelete?: TrainingSessionMutationCallback
  ): Promise<void>;
}
