// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildExportFiles,
  type ExportAccountSource,
  type ExportProfileSource,
  type ExportSessionSource,
  type ExportUserRepository,
} from "@/lib/gdpr/export/build-export-files";

const NOW = new Date("2026-10-06T11:28:00.000Z");

const emptyAccount: ExportAccountSource = {
  settings: { statsPublic: false, notificationsEnabled: true, showOnline: true },
  consents: { healthConsentAt: null, healthConsentVersion: null },
  memberships: [],
  groups: [],
};

function repositoryWith(
  user: Awaited<ReturnType<ExportUserRepository["findProfile"]>>,
  sessions: ExportSessionSource[] = [],
  account: ExportAccountSource | null = emptyAccount,
): ExportUserRepository {
  return {
    findProfile: async () => user,
    findAccountData: async () => account,
    findSessions: async () => sessions,
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

async function dataJsonOf(user: ExportProfileSource, account: ExportAccountSource = emptyAccount) {
  const files = await buildExportFiles(user.id, repositoryWith(user, [], account), NOW);
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

  it("incluye un README.txt que dice qué contiene el ZIP y qué no", async () => {
    const files = await buildExportFiles(athlete.id, repositoryWith(athlete), NOW);

    expect(files!.map((file) => file.name)).toEqual(["data.json", "sessions.csv", "README.txt"]);
    const readme = files!.find((file) => file.name === "README.txt")!.content;
    expect(readme).toContain("data.json");
    expect(readme).toContain("sessions.csv");
    expect(readme).toContain("2026-10-06 11:28 UTC");
    expect(readme).toContain("athlete@example.com");
    expect(readme).toContain("NO SE INCLUYE");
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

});
