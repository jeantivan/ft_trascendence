// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-auth-secret-32-chars-minimum-length";
  process.env.AUTH_TRUST_HOST ??= "true";
  return new Map<string, string>();
});

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

vi.mock("next/headers", () => ({
  headers: async () => {
    const cookie = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    return new Headers({
      host: "localhost:3000",
      "x-forwarded-proto": "http",
      ...(cookie ? { cookie } : {}),
    });
  },
  cookies: async () => ({
    set(name: string, value: string, options?: { maxAge?: number; expires?: Date }) {
      if (value === "" || options?.maxAge === 0 || (options?.expires && options.expires.getTime() <= 0)) {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect(url: string): never {
    throw new RedirectSignal(url);
  },
}));

import { auth, signIn } from "@/auth";
import { hashPassword } from "@/lib/auth/password";
import { deleteAccountAction } from "@/lib/gdpr/actions";
import { requireAuth } from "@/lib/permissions/require-auth";
import { prisma } from "@/lib/prisma";
import { issueDeleteCode } from "../support/delete-account-helper";

const USER_ID = "99999999-9999-4999-8999-999999999991";
const EMAIL = "delete-session@example.test";
const PASSWORD = "PasswordValida123!";

function formWithCode(code: string): FormData {
  const form = new FormData();
  form.append("code", code);
  return form;
}

describe("borrado de cuenta: cierre real de sesión (Auth.js + Postgres)", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    jar.clear();
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.create({
      data: { id: USER_ID, email: EMAIL, nick: "Runner", passwordHash },
    });
    await signIn("credentials", { email: EMAIL, password: PASSWORD, redirect: false });
  });

  afterEach(async () => {
    jar.clear();
    await prisma.auditLog.deleteMany({ where: { actorId: USER_ID } });
    await prisma.user.deleteMany({ where: { id: USER_ID } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("tras borrar la cuenta con deleteAccountAction, signOut limpia la sesión y redirige a /account-deleted", async () => {
    expect((await auth())?.user?.id).toBe(USER_ID);
    const cookieBeforeDelete = new Map(jar);
    const code = await issueDeleteCode(prisma, USER_ID);

    const thrown = await deleteAccountAction(null, formWithCode(code)).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(RedirectSignal);
    expect(new URL((thrown as RedirectSignal).url, "http://localhost:3000").pathname).toBe("/account-deleted");

    // La cookie JWE fue eliminada por el signOut real: auth() ya no devuelve sesión
    expect(await auth()).toBeNull();

    // Incluso si alguien reenvía la cookie antigua anterior al signOut, requireAuth la rechaza porque el usuario ya no existe
    for (const [k, v] of cookieBeforeDelete) jar.set(k, v);
    await expect(requireAuth()).rejects.toMatchObject({ url: "/auth/signed-out" });
  });

  it("si el código es incorrecto, la cuenta no se borra y la sesión sigue activa", async () => {
    const result = await deleteAccountAction(null, formWithCode("000000"));

    expect(result).toEqual({ success: false, error: "Código no válido o caducado" });
    expect((await auth())?.user?.id).toBe(USER_ID);
  });
});
