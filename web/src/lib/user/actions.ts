"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { requireAuth } from "@/lib/permissions/require-auth";
import {
  EmailChangeNotAllowedForOAuthError,
  InvalidCurrentPasswordError,
  MissingCurrentPasswordError,
  UserNotFoundError,
  userSettingsService,
} from "./user-settings-service";
import type { UpdatePrivacyInput } from "./schemas";

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
  if (error instanceof UserNotFoundError) {
    return "Usuario no encontrado o cuenta bloqueada";
  }
  return "No se pudieron guardar los cambios. Inténtalo de nuevo";
}

function readFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function updateNickAction(
  _prevState: unknown,
  formData: FormData
): Promise<SettingsActionResult> {
  const user = await requireAuth();
  const nick = readFormString(formData, "nick");

  try {
    await userSettingsService.updateNick(user.id, { nick });
    revalidatePath("/settings");
    return { success: true, message: "Nick actualizado correctamente" };
  } catch (error) {
    return { success: false, error: mapSettingsError(error) };
  }
}

export async function updateEmailAction(
  _prevState: unknown,
  formData: FormData
): Promise<SettingsActionResult> {
  const user = await requireAuth();
  const email = readFormString(formData, "email");
  const currentPassword = readFormString(formData, "currentPassword");

  try {
    const profile = await userSettingsService.getProfile(user.id);
    if (!profile.hasPassword && !(await isRecentAuth())) {
      return {
        success: false,
        error: "Por seguridad, confirma tu sesión antes de modificar el correo.",
        requiresReauth: true,
      };
    }

    await userSettingsService.updateEmail(user.id, {
      email,
      currentPassword: currentPassword || undefined,
    });
    revalidatePath("/settings");
    return { success: true, message: "Correo electrónico actualizado" };
  } catch (error) {
    return { success: false, error: mapSettingsError(error) };
  }
}

export async function updatePasswordAction(
  _prevState: unknown,
  formData: FormData
): Promise<SettingsActionResult> {
  const user = await requireAuth();
  const currentPassword = readFormString(formData, "currentPassword");
  const newPassword = readFormString(formData, "newPassword");
  const confirmPassword = readFormString(formData, "confirmPassword");

  if (newPassword !== confirmPassword) {
    return { success: false, error: "Las contraseñas nuevas no coinciden" };
  }

  try {
    const profile = await userSettingsService.getProfile(user.id);
    if (!profile.hasPassword && !(await isRecentAuth())) {
      return {
        success: false,
        error: "Por seguridad, confirma tu sesión antes de definir tu primera contraseña.",
        requiresReauth: true,
      };
    }

    await userSettingsService.updatePassword(user.id, {
      currentPassword: currentPassword || undefined,
      newPassword,
    });
    revalidatePath("/settings");
    return {
      success: true,
      message: profile.hasPassword
        ? "Contraseña actualizada correctamente"
        : "Primera contraseña definida correctamente",
    };
  } catch (error) {
    return { success: false, error: mapSettingsError(error) };
  }
}

export async function updatePrivacyAction(
  input: UpdatePrivacyInput
): Promise<SettingsActionResult> {
  const user = await requireAuth();

  try {
    await userSettingsService.updatePrivacy(user.id, input);
    revalidatePath("/settings");
    return { success: true, message: "Preferencias de privacidad actualizadas" };
  } catch (error) {
    return { success: false, error: mapSettingsError(error) };
  }
}

export async function giveHealthConsentAction(): Promise<SettingsActionResult> {
  const user = await requireAuth();

  try {
    await userSettingsService.giveHealthConsent(user.id);
    revalidatePath("/settings");
    return { success: true, message: "Consentimiento de datos de salud otorgado" };
  } catch (error) {
    return { success: false, error: mapSettingsError(error) };
  }
}

export async function withdrawHealthConsentAction(): Promise<SettingsActionResult> {
  const user = await requireAuth();

  try {
    await userSettingsService.withdrawHealthConsent(user.id);
    revalidatePath("/settings");
    return { success: true, message: "Consentimiento de datos de salud retirado" };
  } catch (error) {
    return { success: false, error: mapSettingsError(error) };
  }
}

export async function purgeHealthDataAction(): Promise<SettingsActionResult> {
  const user = await requireAuth();

  try {
    await userSettingsService.purgeHealthData(user.id, { confirm: true });
    revalidatePath("/settings");
    return {
      success: true,
      message: "Datos de salud históricos eliminados correctamente",
    };
  } catch (error) {
    return { success: false, error: mapSettingsError(error) };
  }
}
