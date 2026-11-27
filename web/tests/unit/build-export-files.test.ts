// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AccessLogEntry } from "@/lib/gdpr/audit";
import {
  buildExportFiles,
  type ExportAccountSource,
  type ExportMessageSource,
  type ExportProfileSource,
  type ExportSessionLogSource,
  type ExportSessionSource,
  type ExportUserRepository,
} from "@/lib/gdpr/export/build-export-files";

const NOW = new Date("2026-10-06T11:28:00.000Z");

const emptyAccount: ExportAccountSource = {
  settings: { statsPublic: false, notificationsEnabled: true, showOnline: true },
  consents: { healthConsentAt: null, healthConsentVersion: null },
  memberships: [],
  groups: [],
  events: [],
  feedbackReceived: [],
  contacts: [],
  notifications: [],
};

function repositoryWith(
  user: Awaited<ReturnType<ExportUserRepository["findProfile"]>>,
  sessions: ExportSessionSource[] = [],
  account: ExportAccountSource | null = emptyAccount,
  accessLog: AccessLogEntry[] = [],
  messages: ExportMessageSource[] = [],
  sessionLogs: ExportSessionLogSource[] = [],
): ExportUserRepository {
  return {
    findProfile: async () => user,
    findAccountData: async () => account,
    findSessions: async () => sessions,
    findAccessLog: async () => accessLog,
    findMessages: async () => messages,
    findSessionLogs: async () => sessionLogs,
  };
}

const session: ExportSessionSource = {
  id: "22222222-2222-4222-8222-222222222222",
  orgId: "33333333-3333-4333-8333-333333333333",
  origin: "template",
  sessionType: "rodaje",
  targetDistanceM: 10000,
  targetPaceSPerKm: 360,
  targetDurationS: 3600,
  scheduledAt: new Date("2026-10-01T07:00:00.000Z"),
  groupId: "44444444-4444-4444-8444-444444444444",
  customizesSessionId: null,
};

async function sessionsCsvOf(sessions: ExportSessionSource[]) {
  const files = await buildExportFiles(athlete.id, repositoryWith(athlete, sessions), NOW);
  return files!.find((file) => file.name === "sessions.csv")!.content;
}

async function messagesCsvOf(messages: ExportMessageSource[]) {
  const files = await buildExportFiles(athlete.id, repositoryWith(athlete, [], emptyAccount, [], messages), NOW);
  return files!.find((file) => file.name === "messages.csv")!.content;
}

async function sessionLogsCsvOf(sessionLogs: ExportSessionLogSource[]) {
  const files = await buildExportFiles(athlete.id, repositoryWith(athlete, [], emptyAccount, [], [], sessionLogs), NOW);
  return files!.find((file) => file.name === "session_logs.csv")!.content;
}

const athlete: ExportProfileSource = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "athlete@example.com",
  nick: "runner42",
  image: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  hasPassword: true,
  providers: [],
  totpEnabled: false,
  email2faEnabled: true,
};

async function dataJsonOf(
  user: ExportProfileSource,
  account: ExportAccountSource = emptyAccount,
  accessLog: AccessLogEntry[] = [],
) {
  const files = await buildExportFiles(user.id, repositoryWith(user, [], account, accessLog), NOW);
  const dataJson = files?.find((file) => file.name === "data.json");
  return JSON.parse(dataJson!.content);
}

describe("buildExportFiles", () => {
  it("data.json lleva el perfil del usuario con fechas ISO en UTC", async () => {
    expect(await dataJsonOf(athlete)).toEqual({
      exported_at: "2026-10-06T11:28:00Z",
      profile: {
        id: athlete.id,
        email: "athlete@example.com",
        nick: "runner42",
        image: null,
        created_at: "2026-01-01T00:00:00Z",
        login_methods: ["password"],
        totp_enabled: false,
        email_2fa_enabled: true,
      },
      settings: { stats_public: false, notifications_enabled: true, show_online: true },
      consents: { health_consent_at: null, health_consent_version: null },
      memberships: [],
      groups: [],
      events: [],
      feedback_received: [],
      contacts: [],
      notifications: [],
      access_log: [],
    });
  });

  it.each([
    ["solo contraseña", { hasPassword: true, providers: [] }, ["password"]],
    ["solo Google", { hasPassword: false, providers: ["google"] }, ["google"]],
    ["contraseña y Google", { hasPassword: true, providers: ["google"] }, ["password", "google"]],
    ["sin ningún método", { hasPassword: false, providers: [] }, []],
  ])("login_methods: %s", async (_name, methods, expected) => {
    const data = await dataJsonOf({ ...athlete, ...methods });

    expect(data.profile.login_methods).toEqual(expected);
  });

  it("ningún fichero contiene secretos aunque la fuente los traiga de más", async () => {
    const leaky = {
      ...athlete,
      passwordHash: "$2b$10$secret-hash",
      totpSecret: "JBSWY3DPEHPK3PXP",
      access_token: "oauth-access-token",
    };

    const files = await buildExportFiles(leaky.id, repositoryWith(leaky), NOW);

    const everything = files!.map((file) => file.content).join("\n");
    for (const secret of ["$2b$10$secret-hash", "JBSWY3DPEHPK3PXP", "oauth-access-token"]) {
      expect(everything).not.toContain(secret);
    }
    for (const name of ["password_hash", "totp_secret", "access_token"]) {
      expect(everything).not.toContain(name);
    }
  });

  it("access_log lleva solo fecha sin milisegundos, acción, recurso y rol, sin quién actuó", async () => {
    const entry: AccessLogEntry = {
      created_at: "2026-10-05T09:10:00.123Z",
      action: "block",
      resource: "user",
      actor_role: "admin",
    };

    const data = await dataJsonOf(athlete, emptyAccount, [entry]);

    expect(data.access_log).toEqual([{ ...entry, created_at: "2026-10-05T09:10:00Z" }]);
    expect(Object.keys(data.access_log[0]).sort()).toEqual(["action", "actor_role", "created_at", "resource"]);
  });

  it("incluye un README.txt que dice qué contiene el ZIP y qué no", async () => {
    const files = await buildExportFiles(athlete.id, repositoryWith(athlete), NOW);

    expect(files!.map((file) => file.name)).toEqual(["data.json", "sessions.csv", "messages.csv", "session_logs.csv", "README.txt"]);
    const readme = files!.find((file) => file.name === "README.txt")!.content;
    expect(readme).toContain("data.json");
    expect(readme).toContain("sessions.csv");
    expect(readme).toContain("session_logs.csv: resultados (completada, RPE, distancia, duración)");
    expect(readme).toContain("rpe: escala 1-10 (percepción de esfuerzo); vacío si lo borraste");
    expect(readme).toContain("avg_heart_rate_bpm: frecuencia cardíaca media (ppm); vacío si lo borraste");
    for (const reason of ["time_constraints", "schedule_conflict", "route_unavailable", "equipment_issue", "other"]) {
      expect(readme).toContain(`  - ${reason}: `);
    }
    expect(readme).toContain("messages.csv: los mensajes que escribiste");
    expect(readme).toContain("aparecen con la fecha de borrado si aún los conservamos");
    expect(readme).toContain("2026-10-06 11:28 UTC");
    expect(readme).toContain("athlete@example.com");
    expect(readme).toContain("NO SE INCLUYE");
    for (const block of [
      "ajustes",
      "consentimientos",
      "feedback recibido",
      "contactos",
      "notificaciones",
      "registro de accesos",
    ]) {
      expect(readme).toContain(block);
    }
    expect(readme).toContain("Datos que escribiste como Manager sobre otras personas");
  });

  it("sessions.csv lleva la cabecera de la spec y una fila por sesión, con celdas vacías para lo ausente", async () => {
    const free: ExportSessionSource = {
      ...session,
      id: "55555555-5555-4555-8555-555555555555",
      origin: "free",
      sessionType: "intervalos",
      targetDistanceM: 8000,
      targetPaceSPerKm: null,
      targetDurationS: 1800,
      scheduledAt: new Date("2026-10-02T18:00:00.123Z"),
      groupId: null,
    };

    expect(await sessionsCsvOf([session, free])).toBe(
      [
        "session_id,org_id,origin,session_type,target_distance_m,target_pace_s_per_km,target_duration_s,scheduled_at,group_id,customizes_session_id",
        `${session.id},${session.orgId},template,rodaje,10000,360,3600,2026-10-01T07:00:00Z,${session.groupId},`,
        `${free.id},${free.orgId},free,intervalos,8000,,1800,2026-10-02T18:00:00Z,,`,
        "",
      ].join("\r\n"),
    );
  });

  it("sessions.csv lleva solo la cabecera si el usuario no tiene sesiones", async () => {
    expect(await sessionsCsvOf([])).toBe(
      "session_id,org_id,origin,session_type,target_distance_m,target_pace_s_per_km,target_duration_s,scheduled_at,group_id,customizes_session_id\r\n",
    );
  });

  it("messages.csv lleva la cabecera de la spec, el id como texto y deleted_at vacío si no se borró", async () => {
    const dm: ExportMessageSource = {
      id: BigInt("9007199254740993"),
      conversationId: "66666666-6666-4666-8666-666666666666",
      kind: "dm",
      body: "¿Quedamos antes?",
      createdAt: new Date("2026-10-06T10:00:00.456Z"),
      deletedAt: null,
    };
    const event: ExportMessageSource = {
      ...dm,
      id: BigInt(101),
      conversationId: "77777777-7777-4777-8777-777777777777",
      kind: "event",
      body: "Llego en 5 minutos",
      createdAt: new Date("2026-10-05T07:55:00.000Z"),
    };

    expect(await messagesCsvOf([event, dm])).toBe(
      [
        "message_id,conversation_id,kind,body,created_at,deleted_at",
        `101,${event.conversationId},event,Llego en 5 minutos,2026-10-05T07:55:00Z,`,
        `9007199254740993,${dm.conversationId},dm,¿Quedamos antes?,2026-10-06T10:00:00Z,`,
        "",
      ].join("\r\n"),
    );
  });

  it("messages.csv incluye los mensajes borrados con su fecha de borrado", async () => {
    const deleted: ExportMessageSource = {
      id: BigInt(7),
      conversationId: "66666666-6666-4666-8666-666666666666",
      kind: "dm",
      body: "borrado",
      createdAt: new Date("2026-10-06T10:00:00.000Z"),
      deletedAt: new Date("2026-10-07T08:30:00.789Z"),
    };

    expect(await messagesCsvOf([deleted])).toContain(
      `7,${deleted.conversationId},dm,borrado,2026-10-06T10:00:00Z,2026-10-07T08:30:00Z\r\n`,
    );
  });

  it("messages.csv entrecomilla el texto con comas y saltos de línea, y neutraliza fórmulas en el cuerpo", async () => {
    const base: ExportMessageSource = {
      id: BigInt(1),
      conversationId: "66666666-6666-4666-8666-666666666666",
      kind: "event",
      body: "",
      createdAt: new Date("2026-10-06T10:00:00.000Z"),
      deletedAt: null,
    };

    const csv = await messagesCsvOf([
      { ...base, id: BigInt(1), body: '=HYPERLINK("http://evil.example")' },
      { ...base, id: BigInt(2), body: "hola, \"mundo\"\nadiós" },
    ]);

    expect(csv).toContain(`1,${base.conversationId},event,"'=HYPERLINK(""http://evil.example"")",`);
    expect(csv).toContain(`2,${base.conversationId},event,"hola, ""mundo""\nadiós",`);
  });

  it("messages.csv lleva solo la cabecera si el usuario no ha escrito mensajes", async () => {
    expect(await messagesCsvOf([])).toBe("message_id,conversation_id,kind,body,created_at,deleted_at\r\n");
  });

  const log: ExportSessionLogSource = {
    sessionId: "88888888-8888-4888-8888-888888888888",
    completed: true,
    rpe: 7,
    distanceM: 10200,
    durationS: 3600,
    performedAt: new Date("2026-10-01T07:30:00.789Z"),
    extra: { avg_heart_rate_bpm: 148, max_heart_rate_bpm: 175 },
  };

  it("session_logs.csv lleva la cabecera de la spec y una fila por registro, con la fecha sin milisegundos", async () => {
    const incomplete: ExportSessionLogSource = {
      ...log,
      sessionId: "99999999-9999-4999-8999-999999999999",
      completed: false,
      rpe: 5,
      distanceM: null,
      durationS: 600,
      performedAt: new Date("2026-10-02T18:15:00.000Z"),
      extra: { incompletion_reason: "time_constraints" },
    };

    expect(await sessionLogsCsvOf([log, incomplete])).toBe(
      [
        "session_id,completed,rpe,distance_m,duration_s,performed_at,incompletion_reason,avg_heart_rate_bpm,max_heart_rate_bpm",
        `${log.sessionId},true,7,10200,3600,2026-10-01T07:30:00Z,,148,175`,
        `${incomplete.sessionId},false,5,,600,2026-10-02T18:15:00Z,time_constraints,,`,
        "",
      ].join("\r\n"),
    );
  });

  it("session_logs.csv deja vacías rpe y las frecuencias tras la purga, y el resto de columnas igual", async () => {
    const purged: ExportSessionLogSource = { ...log, rpe: null, extra: null };

    expect(await sessionLogsCsvOf([purged])).toContain(`${log.sessionId},true,,10200,3600,2026-10-01T07:30:00Z,,,\r\n`);
  });

  it("session_logs.csv deja vacías las tres columnas de extra si extra no cumple el esquema", async () => {
    const wrong: ExportSessionLogSource = { ...log, extra: { incompletion_reason: "otra cosa", notes: "texto libre" } };

    expect(await sessionLogsCsvOf([wrong])).toContain(`${log.sessionId},true,7,10200,3600,2026-10-01T07:30:00Z,,,\r\n`);
  });

  it("session_logs.csv lleva solo la cabecera si el usuario no tiene registros", async () => {
    expect(await sessionLogsCsvOf([])).toBe(
      "session_id,completed,rpe,distance_m,duration_s,performed_at,incompletion_reason,avg_heart_rate_bpm,max_heart_rate_bpm\r\n",
    );
  });

  it("devuelve null si el usuario no existe", async () => {
    expect(await buildExportFiles(athlete.id, repositoryWith(null), NOW)).toBeNull();
    expect(await buildExportFiles(athlete.id, repositoryWith(athlete, [], null), NOW)).toBeNull();
  });

  it("settings y consents salen con los nombres de la spec; la versión es un entero", async () => {
    const data = await dataJsonOf(athlete, {
      ...emptyAccount,
      settings: { statsPublic: true, notificationsEnabled: false, showOnline: false },
      consents: { healthConsentAt: new Date("2026-02-01T10:00:00.456Z"), healthConsentVersion: 1 },
    });

    expect(data.settings).toEqual({ stats_public: true, notifications_enabled: false, show_online: false });
    expect(data.consents).toEqual({ health_consent_at: "2026-02-01T10:00:00Z", health_consent_version: 1 });
  });

  it("memberships lleva org_id, org_name, role y joined_at en UTC", async () => {
    const data = await dataJsonOf(athlete, {
      ...emptyAccount,
      memberships: [{ orgId: "org-1", orgName: "Club Running Madrid", role: "athlete", joinedAt: new Date("2026-01-15T00:00:00.000Z") }],
    });

    expect(data.memberships).toEqual([
      { org_id: "org-1", org_name: "Club Running Madrid", role: "athlete", joined_at: "2026-01-15T00:00:00Z" },
    ]);
  });

  it("groups lleva group_id, org_id, name, level y objective, con null para lo ausente", async () => {
    const data = await dataJsonOf(athlete, {
      ...emptyAccount,
      groups: [{ groupId: "group-1", orgId: "org-1", name: "Grupo maratón", level: null, objective: "maratón" }],
    });

    expect(data.groups).toEqual([
      { group_id: "group-1", org_id: "org-1", name: "Grupo maratón", level: null, objective: "maratón" },
    ]);
  });

  it("events lleva el estado de su petición y las fechas en UTC", async () => {
    const data = await dataJsonOf(athlete, {
      ...emptyAccount,
      events: [
        {
          eventId: "event-1",
          orgId: "org-1",
          title: "Rodaje grupal",
          location: "Retiro",
          startsAt: new Date("2026-10-05T08:00:00.000Z"),
          yourStatus: "withdrawn",
          requestedAt: new Date("2026-10-01T09:00:00.000Z"),
        },
      ],
    });

    expect(data.events).toEqual([
      {
        event_id: "event-1",
        org_id: "org-1",
        title: "Rodaje grupal",
        location: "Retiro",
        starts_at: "2026-10-05T08:00:00Z",
        your_status: "withdrawn",
        requested_at: "2026-10-01T09:00:00Z",
      },
    ]);
  });

  it("feedback_received no lleva manager y admite un Event borrado (event_id null)", async () => {
    const data = await dataJsonOf(athlete, {
      ...emptyAccount,
      feedbackReceived: [
        { id: "fb-1", eventId: "event-1", body: "Buen ritmo hoy", createdAt: new Date("2026-10-05T09:00:00.000Z") },
        { id: "fb-2", eventId: null, body: "Sigue así", createdAt: new Date("2026-10-06T09:00:00.000Z") },
      ],
    });

    expect(data.feedback_received).toEqual([
      { id: "fb-1", event_id: "event-1", body: "Buen ritmo hoy", created_at: "2026-10-05T09:00:00Z" },
      { id: "fb-2", event_id: null, body: "Sigue así", created_at: "2026-10-06T09:00:00Z" },
    ]);
    expect(JSON.stringify(data)).not.toContain("manager");
  });

  it("contacts lleva solo estado, quién lo pidió y fecha", async () => {
    const data = await dataJsonOf(athlete, {
      ...emptyAccount,
      contacts: [
        { status: "accepted", requestedByYou: true, createdAt: new Date("2026-03-01T00:00:00.000Z") },
        { status: "pending", requestedByYou: false, createdAt: new Date("2026-03-02T00:00:00.000Z") },
      ],
    });

    expect(data.contacts).toEqual([
      { status: "accepted", requested_by_you: true, created_at: "2026-03-01T00:00:00Z" },
      { status: "pending", requested_by_you: false, created_at: "2026-03-02T00:00:00Z" },
    ]);
  });

  it("notifications serializa el id bigint como string y no lleva payload", async () => {
    const data = await dataJsonOf(athlete, {
      ...emptyAccount,
      notifications: [
        { id: BigInt(123), type: "spot_approved", readAt: null, createdAt: new Date("2026-10-01T09:05:00.000Z") },
        { id: BigInt("9007199254740993"), type: "spot_rejected", readAt: new Date("2026-10-02T10:00:00.000Z"), createdAt: new Date("2026-10-01T09:06:00.000Z") },
      ],
    });

    expect(data.notifications).toEqual([
      { id: "123", type: "spot_approved", read_at: null, created_at: "2026-10-01T09:05:00Z" },
      { id: "9007199254740993", type: "spot_rejected", read_at: "2026-10-02T10:00:00Z", created_at: "2026-10-01T09:06:00Z" },
    ]);
  });
});
