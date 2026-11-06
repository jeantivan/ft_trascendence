// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PrismaCurrentUserRepository } from "@/lib/permissions/current-user-repository";

const EMAIL_PREFIX = "current-user-repository-";
const repository = new PrismaCurrentUserRepository(prisma);

describe("Integration: PrismaCurrentUserRepository", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns only the five fields, never the secret columns", async () => {
    const email = `${EMAIL_PREFIX}active@example.com`;
    const user = await prisma.user.create({
      data: { email, nick: "runner", roleGlobal: "admin", passwordHash: "hash", totpSecret: "secret" },
    });

    await expect(repository.findById(user.id)).resolves.toEqual({
      id: user.id,
      email,
      nick: "runner",
      roleGlobal: "admin",
      blockedAt: null,
    });
  });

  it("returns blockedAt for a blocked user", async () => {
    const blockedAt = new Date();
    const user = await prisma.user.create({
      data: { email: `${EMAIL_PREFIX}blocked@example.com`, blockedAt },
    });

    const found = await repository.findById(user.id);

    expect(found?.blockedAt).toEqual(blockedAt);
  });

  it("returns null for a deleted user", async () => {
    const user = await prisma.user.create({
      data: { email: `${EMAIL_PREFIX}deleted@example.com` },
    });
    await prisma.user.delete({ where: { id: user.id } });

    await expect(repository.findById(user.id)).resolves.toBeNull();
  });
});
