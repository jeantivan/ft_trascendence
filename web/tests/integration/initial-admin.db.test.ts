// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { authorizeCredentials } from "@/lib/auth/credentials";
import { ensureInitialAdmin } from "@/lib/admin/initial-admin";

// Each test uses its own email, so files running at the same time never touch these rows
const DOMAIN = "@initial-admin.test";

const userByEmail = (email: string) =>
  prisma.user.findUnique({ where: { email }, select: { id: true, roleGlobal: true, passwordHash: true } });

afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Integration: ensureInitialAdmin", () => {
  it("creates the Admin account when nobody has that email, with a password the login accepts", async () => {
    const email = `created${DOMAIN}`;

    const result = await ensureInitialAdmin(prisma, { email, password: "a-long-random-password" });

    expect(result).toEqual({ status: "created", email });
    const user = await userByEmail(email);
    expect(user?.roleGlobal).toBe("admin");
    // Through the real login (authorizeCredentials), not only verifyPassword: if the login gains
    // another condition, an Admin that cannot sign in must not stay green
    await expect(authorizeCredentials({ email, password: "a-long-random-password" })).resolves.toMatchObject({
      email,
      roleGlobal: "admin",
    });
  });

  // Every make runs it again: the Admin may have changed the password since
  it("a second run does not duplicate the Admin nor change its password, even with another one in .env", async () => {
    const email = `again${DOMAIN}`;
    await ensureInitialAdmin(prisma, { email, password: "first-password" });
    const before = await userByEmail(email);

    const result = await ensureInitialAdmin(prisma, { email, password: "another-password" });

    expect(result).toEqual({ status: "exists", email });
    const after = await userByEmail(email);
    expect(after).toEqual(before);
    await expect(prisma.user.count({ where: { email } })).resolves.toBe(1);
  });

  // Only in an old database: making it Admin would give the role to whoever signed
  // up first with that email
  it("leaves a normal account with that email untouched and says so", async () => {
    const email = `taken${DOMAIN}`;
    await prisma.user.create({ data: { email, passwordHash: "their-own-hash", roleGlobal: "user" } });

    const result = await ensureInitialAdmin(prisma, { email, password: "a-long-random-password" });

    expect(result).toEqual({ status: "taken-by-user", email });
    await expect(userByEmail(email)).resolves.toMatchObject({ roleGlobal: "user", passwordHash: "their-own-hash" });
  });

  // The message names the .env variable to fix and never shows a value (AGENTS.md)
  it.each([
    ["an empty password", { email: `nopass${DOMAIN}`, password: "" }, /ADMIN_PASSWORD/],
    ["a password of only spaces", { email: `nopass${DOMAIN}`, password: "   " }, /ADMIN_PASSWORD/],
    ["an invalid email", { email: "not-an-email", password: "secret-value-123" }, /ADMIN_EMAIL/],
  ])("stops with %s, naming the .env variable, and creates nothing", async (_name, input, variable) => {
    const error = await ensureInitialAdmin(prisma, input).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(error?.message).toMatch(variable);
    expect(error?.message).not.toContain("secret-value-123");
    await expect(prisma.user.count({ where: { email: { in: [input.email, "not-an-email"] } } })).resolves.toBe(0);
  });

  // Same rule as sign-up (passwordSchema): a password edited by hand in .env must not give the
  // Admin a weaker one than any user has. The generated ones (8 characters) still pass
  it.each([
    ["a password shorter than 8 characters", "short-1"],
    ["a password longer than 72 characters", "x".repeat(73)],
    ["a password over 72 bytes", "é".repeat(40)],
  ])("stops with %s, naming ADMIN_PASSWORD without showing it, and creates nothing", async (_name, password) => {
    const email = `weak${DOMAIN}`;

    const error = await ensureInitialAdmin(prisma, { email, password }).then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(error?.message).toMatch(/ADMIN_PASSWORD/);
    expect(error?.message).not.toContain(password);
    await expect(prisma.user.count({ where: { email } })).resolves.toBe(0);
  });

  it("accepts a password of exactly 8 characters, like the ones make generates", async () => {
    const email = `eight${DOMAIN}`;

    await expect(ensureInitialAdmin(prisma, { email, password: "a1b2c3d4" })).resolves.toEqual({
      status: "created",
      email,
    });
  });

  // .env is edited by hand: sign-up keeps emails trimmed and in lowercase, so this must too
  it("takes the email in lowercase and without spaces, so an edited .env finds the same Admin", async () => {
    const email = `case${DOMAIN}`;
    await ensureInitialAdmin(prisma, { email: `  CASE${DOMAIN.toUpperCase()} `, password: "first-password" });

    // It also gives the email as stored, so what is printed always matches the account
    await expect(
      ensureInitialAdmin(prisma, { email: `  CASE${DOMAIN.toUpperCase()} `, password: "first-password" }),
    ).resolves.toEqual({ status: "exists", email });
    await expect(userByEmail(email)).resolves.toMatchObject({ roleGlobal: "admin" });
    await expect(prisma.user.count({ where: { email: { endsWith: DOMAIN, mode: "insensitive" } } })).resolves.toBe(1);
  });
});
