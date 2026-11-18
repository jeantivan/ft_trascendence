"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth, signOut } from "@/auth";
import { UserAlreadyExistsError } from "@/lib/auth/user-repository";
import { requireAuth } from "@/lib/permissions/require-auth";
import type { UpdatePrivacyInput } from "./schemas";
import {
  EmailChangeNotAllowedForOAuthError,
  InvalidCurrentPasswordError,
  MissingCurrentPasswordError,
  UserNotFoundError,
  userSettingsService,
} from "./user-settings-service";

export type SettingsActionResult =
  | { success: true; message: string }
  | { success: false; error: string; requiresReauth?: boolean };

const RECENT_AUTH_WINDOW_SECONDS = 5 * 60;

export async function isRecentAuth(nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const session = await auth();
  if (typeof session?.authTime !== "number") return false;
  return nowSeconds - session.authTime <= RECENT_AUTH_WINDOW_SECONDS;
}

function mapSettingsError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "Revisa los datos introducidos";
  }
  if (
    error instanceof MissingCurrentPasswordError ||
    error instanceof InvalidCurrentPasswordError
  ) {
    return error.message;
  }
  if (error instanceof EmailChangeNotAllowedForOAuthError) {
    return "Las cuentas sin contraseña no pueden cambiar el correo directamente";
  }
  if (error instanceof UserAlreadyExistsError) {
    return "Ese correo electrónico ya está registrado";
  }
  if (error instanceof UserNotFoundError) {
    return "Usuario no encontrado o cuenta bloqueada";
  }
  return "No se pudieron guardar los cambios. Inténtalo de nuevo";
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function runSettingsAction(
  fn: (userId: string) => Promise<SettingsActionResult>
): Promise<SettingsActionResult> {
  const user = await requireAuth();

  try {
    const result = await fn(user.id);
    if (result.success) {
      revalidatePath("/settings");
    }
    return result;
  } catch (error) {
    return { success: false, error: mapSettingsError(error) };
  }
}

export async function reauthenticateAction(): Promise<void> {
  await signOut({ redirectTo: "/login?callbackUrl=/settings" });
}

export async function updateNickAction(
  _prevState: unknown,
  formData: FormData
): Promise<SettingsActionResult> {
  const nick = readFormString(formData, "nick");

  return runSettingsAction(async (userId) => {
    await userSettingsService.updateNick(userId, { nick });
    return { success: true, message: "Nick actualizado correctamente" };
  });
}

export async function updateEmailAction(
  _prevState: unknown,
  formData: FormData
): Promise<SettingsActionResult> {
  const email = readFormString(formData, "email");
  const currentPassword = readFormString(formData, "currentPassword");

  return runSettingsAction(async (userId) => {
    await userSettingsService.updateEmail(userId, {
      email,
      currentPassword: currentPassword || undefined,
    });
    return { success: true, message: "Correo electrónico actualizado" };
  });
}

export async function updatePasswordAction(
  _prevState: unknown,
  formData: FormData
): Promise<SettingsActionResult> {
  const currentPassword = readFormString(formData, "currentPassword");
  const newPassword = readFormString(formData, "newPassword");
  const confirmPassword = readFormString(formData, "confirmPassword");

  return runSettingsAction(async (userId) => {
    if (newPassword !== confirmPassword) {
      return { success: false, error: "Las contraseñas nuevas no coinciden" };
    }

    const profile = await userSettingsService.getProfile(userId);
    if (!profile.hasPassword && !(await isRecentAuth())) {
      return {
        success: false,
        error: "Por seguridad, confirma tu sesión antes de definir tu primera contraseña.",
        requiresReauth: true,
      };
    }

    await userSettingsService.updatePassword(userId, {
      currentPassword: currentPassword || undefined,
      newPassword,
    });
    return {
      success: true,
      message: profile.hasPassword
        ? "Contraseña actualizada correctamente"
        : "Primera contraseña definida correctamente",
    };
  });
}

export async function updatePrivacyAction(
  input: UpdatePrivacyInput
): Promise<SettingsActionResult> {
  return runSettingsAction(async (userId) => {
    await userSettingsService.updatePrivacy(userId, input);
    return { success: true, message: "Preferencias de privacidad actualizadas" };
  });
}

export async function giveHealthConsentAction(): Promise<SettingsActionResult> {
  return runSettingsAction(async (userId) => {
    await userSettingsService.giveHealthConsent(userId);
    return { success: true, message: "Consentimiento de datos de salud otorgado" };
  });
}

export async function withdrawHealthConsentAction(): Promise<SettingsActionResult> {
  return runSettingsAction(async (userId) => {
    await userSettingsService.withdrawHealthConsent(userId);
    return { success: true, message: "Consentimiento de datos de salud retirado" };
  });
}

export async function purgeHealthDataAction(): Promise<SettingsActionResult> {
  return runSettingsAction(async (userId) => {
    await userSettingsService.purgeHealthData(userId, { confirm: true });
    return {
      success: true,
      message: "Datos de salud históricos eliminados correctamente",
    };
  });
}
