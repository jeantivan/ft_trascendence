import type {
  ContactStatus,
  ConversationKind,
  MembershipRole,
  SessionOrigin,
  SessionType,
  SpotRequestStatus,
} from "@/generated/prisma/client";
import type { AccessLogEntry } from "@/lib/gdpr/audit";
import { toCsv } from "@/lib/gdpr/export/csv";
import { sessionLogExtraSchema } from "@/lib/training/schemas";
import type { ExportFile } from "@/lib/gdpr/export/write-export-zip";

// What the export may read about a user. The repository selects exactly these
// fields, so secrets (password_hash, totp_secret, OAuth tokens) never reach the ZIP.
export type ExportProfileSource = {
  id: string;
  email: string;
  nick: string | null;
  image: string | null;
  createdAt: Date;
  hasPassword: boolean;
  providers: string[];
  totpEnabled: boolean;
  email2faEnabled: boolean;
};

// One row of sessions.csv: the prescription only, never the logs of other athletes
export type ExportSessionSource = {
  id: string;
  orgId: string;
  origin: SessionOrigin;
  sessionType: SessionType;
  targetDistanceM: number | null;
  targetPaceSPerKm: number | null;
  targetDurationS: number | null;
  scheduledAt: Date;
  groupId: string | null;
  customizesSessionId: string | null;
};

// One row of messages.csv: a message the user wrote, never one from the other people in the chat
export type ExportMessageSource = {
  // bigserial: it goes out as a string, like the notification ids
  id: bigint;
  conversationId: string;
  kind: ConversationKind;
  body: string;
  createdAt: Date;
  deletedAt: Date | null;
};

// One row of session_logs.csv: what the user logged, never the logs of other athletes.
// rpe and extra are null after the health purge (#131); extra is read with the Zod schema
// of #141 when the CSV is built, so the repository does not need to know its keys
export type ExportSessionLogSource = {
  sessionId: string;
  completed: boolean;
  rpe: number | null;
  distanceM: number | null;
  durationS: number | null;
  performedAt: Date;
  extra: unknown;
};

// The rest of data.json. Nothing of other people is selected: no manager_id, no id, nick or
// email of a contact, no notification payload (docs/gdpr/export-spec.md, section 3.1).
export type ExportAccountSource = {
  settings: { statsPublic: boolean; notificationsEnabled: boolean; showOnline: boolean };
  consents: { healthConsentAt: Date | null; healthConsentVersion: number | null };
  memberships: { orgId: string; orgName: string; role: MembershipRole; joinedAt: Date }[];
  groups: { groupId: string; orgId: string; name: string; level: string | null; objective: string | null }[];
  // Every Event she asked a spot for, whatever the status of the request
  events: {
    eventId: string;
    orgId: string;
    title: string;
    location: string;
    startsAt: Date;
    yourStatus: SpotRequestStatus;
    requestedAt: Date;
  }[];
  // eventId is null if the Event was deleted: the Athlete keeps the Feedback
  feedbackReceived: { id: string; eventId: string | null; body: string; createdAt: Date }[];
  contacts: { status: ContactStatus; requestedByYou: boolean; createdAt: Date }[];
  // The id is a bigserial: it goes out as a string because JSON.stringify rejects bigint
  notifications: { id: bigint; type: string; readAt: Date | null; createdAt: Date }[];
};

export type ExportUserRepository = {
  findProfile(userId: string): Promise<ExportProfileSource | null>;
  // Settings, consents and the records tied to the user, read in one transaction so the
  // blocks agree with each other. null if the user does not exist
  findAccountData(userId: string): Promise<ExportAccountSource | null>;
  // Sessions of the user: individual ones, those of the groups they belong to, and
  // those of any group where they have a log or where their customized copy comes from
  // (so session_logs.csv and customizes_session_id never point to a missing session),
  // ordered by date
  findSessions(userId: string): Promise<ExportSessionSource[]>;
  // Every message the user wrote, in DMs and Event chats, deleted ones included. Not
  // filtered by removedAt or current membership (docs/gdpr/export-spec.md, section 3.4),
  // ordered by date
  findMessages(userId: string): Promise<ExportMessageSource[]>;
  // Every log the user wrote, ordered by date. Only hers: a group session holds the logs of
  // other athletes too
  findSessionLogs(userId: string): Promise<ExportSessionLogSource[]>;
  // Actions a Manager or an Admin took on the user, oldest first. Already shaped for the
  // export: no actor id
  findAccessLog(userId: string): Promise<AccessLogEntry[]>;
};

// ISO 8601 in UTC without milliseconds (docs/gdpr/export-spec.md, section 3)
function toExportDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function toExportDateOrNull(date: Date | null): string | null {
  return date === null ? null : toExportDate(date);
}

export async function buildExportFiles(
  userId: string,
  repository: ExportUserRepository,
  now: Date,
): Promise<ExportFile[] | null> {
  const profile = await repository.findProfile(userId);
  if (profile === null) return null;
  const account = await repository.findAccountData(userId);
  if (account === null) return null;
  const sessions = await repository.findSessions(userId);
  const messages = await repository.findMessages(userId);
  const sessionLogs = await repository.findSessionLogs(userId);
  const accessLog = await repository.findAccessLog(userId);

  const data = {
    exported_at: toExportDate(now),
    profile: {
      id: profile.id,
      email: profile.email,
      nick: profile.nick,
      image: profile.image,
      created_at: toExportDate(profile.createdAt),
      login_methods: [...(profile.hasPassword ? ["password"] : []), ...profile.providers],
      totp_enabled: profile.totpEnabled,
      email_2fa_enabled: profile.email2faEnabled,
    },
    settings: {
      stats_public: account.settings.statsPublic,
      notifications_enabled: account.settings.notificationsEnabled,
      show_online: account.settings.showOnline,
    },
    consents: {
      health_consent_at: toExportDateOrNull(account.consents.healthConsentAt),
      health_consent_version: account.consents.healthConsentVersion,
    },
    memberships: account.memberships.map((membership) => ({
      org_id: membership.orgId,
      org_name: membership.orgName,
      role: membership.role,
      joined_at: toExportDate(membership.joinedAt),
    })),
    groups: account.groups.map((group) => ({
      group_id: group.groupId,
      org_id: group.orgId,
      name: group.name,
      level: group.level,
      objective: group.objective,
    })),
    events: account.events.map((event) => ({
      event_id: event.eventId,
      org_id: event.orgId,
      title: event.title,
      location: event.location,
      starts_at: toExportDate(event.startsAt),
      your_status: event.yourStatus,
      requested_at: toExportDate(event.requestedAt),
    })),
    feedback_received: account.feedbackReceived.map((feedback) => ({
      id: feedback.id,
      event_id: feedback.eventId,
      body: feedback.body,
      created_at: toExportDate(feedback.createdAt),
    })),
    contacts: account.contacts.map((contact) => ({
      status: contact.status,
      requested_by_you: contact.requestedByYou,
      created_at: toExportDate(contact.createdAt),
    })),
    notifications: account.notifications.map((notification) => ({
      id: notification.id.toString(),
      type: notification.type,
      read_at: toExportDateOrNull(notification.readAt),
      created_at: toExportDate(notification.createdAt),
    })),
    access_log: accessLog.map((entry) => ({
      created_at: toExportDate(new Date(entry.created_at)),
      action: entry.action,
      resource: entry.resource,
      actor_role: entry.actor_role,
    })),
  };
  return [
    { name: "data.json", content: JSON.stringify(data, null, 2) },
    { name: "sessions.csv", content: buildSessionsCsv(sessions) },
    { name: "messages.csv", content: buildMessagesCsv(messages) },
    { name: "session_logs.csv", content: buildSessionLogsCsv(sessionLogs) },
    { name: "README.txt", content: buildReadme(profile.email, now) },
  ];
}

function buildSessionsCsv(sessions: ExportSessionSource[]): string {
  return toCsv(
    [
      "session_id",
      "org_id",
      "origin",
      "session_type",
      "target_distance_m",
      "target_pace_s_per_km",
      "target_duration_s",
      "scheduled_at",
      "group_id",
      "customizes_session_id",
    ],
    sessions.map((session) => [
      session.id,
      session.orgId,
      session.origin,
      session.sessionType,
      session.targetDistanceM,
      session.targetPaceSPerKm,
      session.targetDurationS,
      toExportDate(session.scheduledAt),
      session.groupId,
      session.customizesSessionId,
    ]),
  );
}

function buildSessionLogsCsv(sessionLogs: ExportSessionLogSource[]): string {
  return toCsv(
    [
      "session_id",
      "completed",
      "rpe",
      "distance_m",
      "duration_s",
      "performed_at",
      "incompletion_reason",
      "avg_heart_rate_bpm",
      "max_heart_rate_bpm",
    ],
    sessionLogs.map((sessionLog) => {
      // A null or invalid extra leaves its three cells empty: one bad row must not block the export
      const parsed = sessionLogExtraSchema.safeParse(sessionLog.extra);
      const extra = parsed.success ? parsed.data : {};
      return [
        sessionLog.sessionId,
        sessionLog.completed,
        sessionLog.rpe,
        sessionLog.distanceM,
        sessionLog.durationS,
        toExportDate(sessionLog.performedAt),
        extra.incompletion_reason,
        extra.avg_heart_rate_bpm,
        extra.max_heart_rate_bpm,
      ];
    }),
  );
}

function buildMessagesCsv(messages: ExportMessageSource[]): string {
  return toCsv(
    ["message_id", "conversation_id", "kind", "body", "created_at", "deleted_at"],
    messages.map((message) => [
      String(message.id),
      message.conversationId,
      message.kind,
      message.body,
      toExportDate(message.createdAt),
      toExportDateOrNull(message.deletedAt),
    ]),
  );
}

// Text from docs/gdpr/export-spec.md section 3.5, limited to what the ZIP holds today.
// Platform name and contact come from the privacy policy draft (docs/legal/privacy-policy.md).
function buildReadme(email: string, now: Date): string {
  const date = toExportDate(now).replace("T", " ").replace(/:\d{2}Z$/, " UTC");
  return [
    "DATOS EXPORTADOS DE STRIDESYNC",
    `Fecha: ${date}`,
    `Usuario: ${email}`,
    "",
    "CONTENIDO:",
    "- data.json: perfil, ajustes, consentimientos, clubes, grupos, eventos,",
    "  feedback recibido, contactos, notificaciones y registro de accesos",
    "- sessions.csv: tus sesiones de entrenamiento (individuales, de tus grupos y de",
    "  grupos que dejaste si registraste la sesión), una fila por sesión",
    "- session_logs.csv: resultados (completada, RPE, distancia, duración)",
    "- messages.csv: los mensajes que escribiste (los borrados por moderación",
    "  aparecen con la fecha de borrado si aún los conservamos)",
    "",
    "CAMPOS:",
    "- distance_m: distancia en metros",
    "- duration_s: duración en segundos",
    "- rpe: escala 1-10 (percepción de esfuerzo); vacío si lo borraste",
    "- incompletion_reason: motivo si no se completó",
    "  - time_constraints: falta de tiempo",
    "  - schedule_conflict: conflicto de horario",
    "  - route_unavailable: ruta no disponible",
    "  - equipment_issue: problema de equipamiento",
    "  - other: otro",
    "- avg_heart_rate_bpm: frecuencia cardíaca media (ppm); vacío si lo borraste",
    "- max_heart_rate_bpm: frecuencia cardíaca máxima (ppm); vacío si lo borraste",
    "",
    "ZONA HORARIA: UTC",
    "",
    "NO SE INCLUYE:",
    "- Contraseñas, credenciales OAuth ni secretos de autenticación (TOTP)",
    "- Datos de otras personas: del feedback no se incluye quién lo escribió, y de",
    "  los contactos solo el estado, quién lo pidió y la fecha",
    "- Datos que escribiste como Manager sobre otras personas",
    "  (Feedback, Events, plantillas)",
    "",
    "Si necesitas más datos de los que incluye la descarga, escribe a",
    "legal@stridesync.fit.",
    "",
  ].join("\n");
}
