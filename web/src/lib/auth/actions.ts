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
  authErrorMessage: string
): Promise<AuthActionResult> {
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
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

export async function loginAction(
  _prevState: unknown,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return {
      success: false,
      error: "Email o contraseña incorrectos",
    };
  }

  return authenticateWithCredentials(
    email,
    password,
    "Email o contraseña incorrectos"
  );
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
