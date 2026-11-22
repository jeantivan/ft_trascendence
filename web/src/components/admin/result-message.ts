import type { AccountActionResult, UpdateNickResult } from "@/lib/admin/accounts";

// What the Admin panel (#102) says after each action. "changed: false" means the
// account was already like that (for example, another Admin did it first)

export type ResultMessage = { variant: "success" | "info" | "error"; text: string };

type Kind = "block" | "unblock" | "nick" | "delete";

const DONE: Record<Kind, string> = {
  block: "Cuenta bloqueada: no podrá entrar en su siguiente petición.",
  unblock: "Cuenta desbloqueada.",
  nick: "Nick cambiado.",
  // The list says it instead (DELETED_NOTICE): the action goes back there when it is done
  delete: "Cuenta borrada.",
};

// On the list, after the account page's delete action brought the Admin back (?deleted=1)
export const DELETED_NOTICE = DONE.delete;

// deleteAccount always says changed: true, so delete has no "already" message
const ALREADY: Record<Exclude<Kind, "delete">, string> = {
  block: "La cuenta ya estaba bloqueada.",
  unblock: "La cuenta ya estaba desbloqueada.",
  nick: "Ese ya era su nick.",
};

// self and last-admin only refuse blocking and deleting; what they say depends on which
const VERB: Record<"block" | "delete", string> = { block: "bloquear", delete: "borrar" };

// null before the first submit, and for an invalid nick (its form shows it on the field)
export function resultMessage(kind: Kind, result: AccountActionResult | UpdateNickResult | null): ResultMessage | null {
  if (!result) return null;
  if (result.ok) {
    if (result.changed || kind === "delete") return { variant: "success", text: DONE[kind] };
    return { variant: "info", text: ALREADY[kind] };
  }
  // Only blocking and deleting get these two refusals: the other actions never return them
  const verb = kind === "block" || kind === "delete" ? VERB[kind] : null;
  if (result.reason === "self" && verb) return { variant: "error", text: `No puedes ${verb} tu propia cuenta.` };
  if (result.reason === "not-found") return { variant: "error", text: "Esta cuenta ya no existe." };
  if (result.reason === "last-admin" && verb) {
    return { variant: "error", text: `No se puede ${verb} al último administrador sin bloquear.` };
  }
  return null;
}
