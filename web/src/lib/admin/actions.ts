"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  blockAccount,
  deleteAccount,
  unblockAccount,
  updateAccountNick,
  type AccountActionResult,
  type UpdateNickResult,
} from "@/lib/admin/accounts";
import { requireAdmin } from "@/lib/permissions/require-admin";
import { prisma } from "@/lib/prisma";

// Server Actions of the Admin panel (#102), for forms with useActionState.
// The Admin comes from the session and the database (requireAdmin), never from
// the form. Outside try/catch: requireAdmin redirects or answers 404 by throwing (#199)

// The list and the account page are drawn again with the database's data after an
// action that went through, also with changed: false (another Admin got there first,
// so what the page shows is old), and after a refusal for being the last unblocked Admin
// (another Admin was blocked after the page was drawn). Not after the other refusals:
// nothing changed, and for not-found the account page would turn into a 404 and lose
// its message
function redrawPanelIfStale<T extends AccountActionResult | UpdateNickResult>(result: T): T {
  if (result.ok || result.reason === "last-admin") revalidatePath("/admin/accounts", "layout");
  return result;
}

// A field that is missing or not text becomes "", which the service rejects
function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function blockAccountAction(_prevState: unknown, formData: FormData): Promise<AccountActionResult> {
  const admin = await requireAdmin();
  return redrawPanelIfStale(
    await blockAccount(prisma, { adminId: admin.id, accountId: textField(formData, "accountId") }),
  );
}

export async function unblockAccountAction(_prevState: unknown, formData: FormData): Promise<AccountActionResult> {
  const admin = await requireAdmin();
  return redrawPanelIfStale(
    await unblockAccount(prisma, { adminId: admin.id, accountId: textField(formData, "accountId") }),
  );
}

export async function updateAccountNickAction(_prevState: unknown, formData: FormData): Promise<UpdateNickResult> {
  const admin = await requireAdmin();
  return redrawPanelIfStale(
    await updateAccountNick(prisma, {
      adminId: admin.id,
      accountId: textField(formData, "accountId"),
      nick: textField(formData, "nick"),
    }),
  );
}

// Deleted: its account page no longer exists, so back to the list, which says so
// (?deleted=1). redirect ends by throwing, like requireAdmin: outside try/catch
export async function deleteAccountAction(_prevState: unknown, formData: FormData): Promise<AccountActionResult> {
  const admin = await requireAdmin();
  const result = await deleteAccount(prisma, { adminId: admin.id, accountId: textField(formData, "accountId") });
  if (!result.ok) return redrawPanelIfStale(result);
  revalidatePath("/admin/accounts", "layout");
  redirect("/admin/accounts?deleted=1");
}
