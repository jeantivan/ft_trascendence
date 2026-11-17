import type { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { emailSchema, passwordSchema } from "@/lib/auth/schemas";

// The first Admin of a fresh install (#213): without one, nobody can create clubs
// (matrix #2). Run on every start (make and make dev), before the app takes
// requests, with ADMIN_EMAIL and ADMIN_PASSWORD from .env.
// taken-by-user: a normal account already has that email. It happens in an old
// database (this runs before the app takes sign-ups) or when ADMIN_EMAIL is changed
// to the email of an existing account. It is left untouched: making it Admin would
// give the role to whoever signed up first with that email
// email: as stored (trimmed, lowercase), so what the caller prints matches the account
export type InitialAdminResult = { status: "created" | "exists" | "taken-by-user"; email: string };

export async function ensureInitialAdmin(
  db: PrismaClient,
  input: { email: string; password: string },
): Promise<InitialAdminResult> {
  // The errors name the .env variable to fix and never show a value (AGENTS.md)
  if (input.password.trim() === "") {
    throw new Error("ADMIN_PASSWORD is empty in .env: run make again to generate it");
  }
  // The same rule as sign-up, so a password edited by hand cannot be weaker than any user's.
  // The ones make generates (8 characters) pass. Only the rule is named, never the value
  if (!passwordSchema.safeParse(input.password).success) {
    throw new Error("ADMIN_PASSWORD in .env must have 8 to 72 characters (and at most 72 bytes): fix it or empty it and run make again");
  }
  // Trimmed and in lowercase like sign-up, so an email edited by hand in .env
  // still finds the same account
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) throw new Error("ADMIN_EMAIL in .env is not a valid email");
  const email = parsed.data;

  // Every start runs this again: an existing account is never changed (the Admin
  // may have set a new password since)
  const existing = await db.user.findUnique({ where: { email }, select: { roleGlobal: true } });
  if (existing) return { status: existing.roleGlobal === "admin" ? "exists" : "taken-by-user", email };

  // Same hash as sign-up, so the login checks it the same way
  const passwordHash = await hashPassword(input.password);
  await db.user.create({ data: { email, passwordHash, roleGlobal: "admin", nick: "Administrador" } });
  return { status: "created", email };
}
