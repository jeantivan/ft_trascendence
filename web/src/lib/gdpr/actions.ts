"use server";

import { signOut } from "@/auth";
import { createSmtpMailSender } from "@/lib/mail/smtp-mail-sender";
import { requireAuth } from "@/lib/permissions/require-auth";
import { prisma } from "@/lib/prisma";
import { deleteAccountWithOtp } from "./delete-account";
import { PrismaOtpRepository } from "./prisma-otp-repository";
import { requestDeleteCode } from "./request-delete-code";

export type DeleteAccountActionResult =
  | { success: true }
  | { success: false; error: string };

export type RequestDeleteCodeActionResult =
  | { success: true }
  | { success: false; error: string; retryAfterSeconds?: number };

// Takes no input on purpose: the recipient is the session user's email, so a
// request cannot send the code anywhere else
export async function requestDeleteCodeAction(): Promise<RequestDeleteCodeActionResult> {
  // Outside try/catch: requireAuth redirects by throwing
  const user = await requireAuth();

  let mailer;
  try {
    mailer = createSmtpMailSender();
  } catch {
    // Missing or invalid SMTP settings: nothing was issued, so no cooldown runs
    return { success: false, error: "No se pudo enviar el código. Inténtalo más tarde." };
  }

  const result = await requestDeleteCode(user, new PrismaOtpRepository(prisma), mailer);
  if (result.sent) return { success: true };
  if (result.reason === "cooldown") {
    return {
      success: false,
      error: "Ya se envió un código hace poco. Espera antes de pedir otro.",
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }
  return {
    success: false,
    error: "No se pudo enviar el código. Espera un minuto antes de reintentarlo.",
    retryAfterSeconds: 60,
  };
}

export async function deleteAccountAction(
  _prevState: unknown,
  formData: FormData
): Promise<DeleteAccountActionResult> {
  // The user comes from the validated session and the database, never from the form.
  // Outside try/catch: requireAuth redirects by throwing
  const user = await requireAuth();

  const code = formData.get("code");
  if (typeof code !== "string" || code.length === 0) {
    return { success: false, error: "Código no válido o caducado" };
  }

  const result = await deleteAccountWithOtp(user.id, code);
  if (!result.deleted) {
    return { success: false, error: "Código no válido o caducado" };
  }

  // Only after the deletion is committed. Also throws a redirect: no try/catch here
  await signOut({ redirectTo: "/account-deleted" });
  return { success: true };
}
