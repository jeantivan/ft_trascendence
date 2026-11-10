// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PrismaUserRepository, UserAlreadyExistsError } from "@/lib/auth/user-repository";

const email = "user-repository-same-email@example.com";
const email2 = "user-repository-other-email@example.com";
const repository = new PrismaUserRepository(prisma);

function register() {
  return repository.createUser({ email, passwordHash: "hash", nick: "runner" });
}

describe("Integration: PrismaUserRepository", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [email, email2] } } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates only one user when two registrations with the same email arrive at once", async () => {
    const results = await Promise.allSettled([register(), register()]);

    const created = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(UserAlreadyExistsError);
    await expect(prisma.user.count({ where: { email } })).resolves.toBe(1);
  });

  it("throws UserAlreadyExistsError when updating email to an existing email", async () => {
    await register();
    const user2 = await repository.createUser({
      email: email2,
      passwordHash: "hash2",
      nick: "runner2",
    });

    await expect(repository.updateEmail(user2.id, email)).rejects.toThrow(
      UserAlreadyExistsError
    );
  });
});
