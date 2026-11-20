// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildExportFiles, type ExportProfileSource, type ExportUserRepository } from "@/lib/gdpr/export/build-export-files";

const NOW = new Date("2026-10-06T11:28:00.000Z");

function repositoryWith(user: Awaited<ReturnType<ExportUserRepository["findProfile"]>>): ExportUserRepository {
  return { findProfile: async () => user };
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

async function dataJsonOf(user: ExportProfileSource) {
  const files = await buildExportFiles(user.id, repositoryWith(user), NOW);
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

    expect(files!.map((file) => file.name)).toEqual(["data.json", "README.txt"]);
    const readme = files!.find((file) => file.name === "README.txt")!.content;
    expect(readme).toContain("data.json");
    expect(readme).toContain("2026-10-06 11:28 UTC");
    expect(readme).toContain("athlete@example.com");
    expect(readme).toContain("NO SE INCLUYE");
  });

  it("devuelve null si el usuario no existe", async () => {
    expect(await buildExportFiles(athlete.id, repositoryWith(null), NOW)).toBeNull();
  });
});
