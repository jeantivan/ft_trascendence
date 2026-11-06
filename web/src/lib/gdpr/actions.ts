"use server";

import { signOut } from "@/auth";
import { requireAuth } from "@/lib/permissions/require-auth";
import { deleteAccountWithOtp } from "./delete-account";

export type DeleteAccountActionResult =
  | { success: true }
  | { success: false; error: string };

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
