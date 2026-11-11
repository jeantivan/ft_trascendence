"use server";

import {
  blockAccount,
  unblockAccount,
  updateAccountNick,
  type AccountActionResult,
  type UpdateNickResult,
} from "@/lib/admin/accounts";
import { requireAdmin } from "@/lib/permissions/require-admin";
import { prisma } from "@/lib/prisma";

// Server Actions of the Admin panel (#102), for forms with useActionState.
// The Admin comes from the session and the database (requireAdmin), never from
// the form. Outside try/catch: requireAdmin redirects or answers 403 by throwing

// A field that is missing or not text becomes "", which the service rejects
function textField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function blockAccountAction(_prevState: unknown, formData: FormData): Promise<AccountActionResult> {
  const admin = await requireAdmin();
  return blockAccount(prisma, { adminId: admin.id, accountId: textField(formData, "accountId") });
}

export async function unblockAccountAction(_prevState: unknown, formData: FormData): Promise<AccountActionResult> {
  const admin = await requireAdmin();
  return unblockAccount(prisma, { adminId: admin.id, accountId: textField(formData, "accountId") });
}

export async function updateAccountNickAction(_prevState: unknown, formData: FormData): Promise<UpdateNickResult> {
  const admin = await requireAdmin();
  return updateAccountNick(prisma, {
    adminId: admin.id,
    accountId: textField(formData, "accountId"),
    nick: textField(formData, "nick"),
  });
}
