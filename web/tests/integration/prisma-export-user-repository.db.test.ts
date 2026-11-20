// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createPrismaExportUserRepository } from "@/lib/gdpr/export/prisma-export-user-repository";

const email = "export-user-repository@example.com";
const repository = createPrismaExportUserRepository(prisma);

describe("Integration: createPrismaExportUserRepository", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("devuelve el perfil con los métodos de acceso y sin secretos", async () => {
    const user = await prisma.user.create({
      data: {
        email,
        nick: "runner",
        passwordHash: "$2b$10$secret-hash",
        email2faEnabled: true,
        accounts: {
          create: {
            type: "oauth",
            provider: "google",
            providerAccountId: "export-repo-google-1",
            access_token: "oauth-access-token",
          },
        },
      },
    });

    const profile = await repository.findProfile(user.id);

    expect(profile).toEqual({
      id: user.id,
      email,
      nick: "runner",
      image: null,
      createdAt: user.createdAt,
      hasPassword: true,
      providers: ["google"],
      totpEnabled: false,
      email2faEnabled: true,
    });
    expect(JSON.stringify(profile)).not.toContain("secret-hash");
    expect(JSON.stringify(profile)).not.toContain("oauth-access-token");
  });

  it("devuelve null si el usuario no existe", async () => {
    await expect(repository.findProfile("00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
  });
});
