"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { registerUser } from "./register";

export type AuthActionResult =
  | { success: true }
  | { success: false; error: string };

async function authenticateWithCredentials(
  email: string,
  password: string,
  authErrorMessage: string,
  redirectTo = "/dashboard"
): Promise<AuthActionResult> {
  const safeRedirect =
    redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : "/dashboard";

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: safeRedirect,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { success: false, error: authErrorMessage };
    }
    throw error;
  }
}

export async function registerAction(
  _prevState: unknown,
  formData: FormData
): Promise<AuthActionResult> {
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
    nick: formData.get("nick"),
  };

  const result = await registerUser(rawData);
  if (!result.success) {
    return result;
  }

  return authenticateWithCredentials(
    String(rawData.email ?? ""),
    String(rawData.password ?? ""),
    "Error al iniciar sesión tras el registro"
  );
}

// One message for a wrong email, a wrong password and a blocked account
// (credentials.ts refuses the three alike): naming only "blocked" would tell an
// attacker which emails exist
const LOGIN_ERROR = "Email o contraseña incorrectos o cuenta bloqueada";

export async function loginAction(
  _prevState: unknown,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email");
  const password = formData.get("password");
  const callbackUrl = formData.get("callbackUrl");

  if (typeof email !== "string" || typeof password !== "string") {
    return {
      success: false,
      error: LOGIN_ERROR,
    };
  }

  const redirectTo =
    typeof callbackUrl === "string" && callbackUrl.length > 0
      ? callbackUrl
      : "/dashboard";

  return authenticateWithCredentials(
    email,
    password,
    LOGIN_ERROR,
    redirectTo
  );
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
