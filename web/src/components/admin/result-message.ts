import type { AccountActionResult, UpdateNickResult } from "@/lib/admin/accounts";

// What the Admin panel (#102) says after each action. "changed: false" means the
// account was already like that (for example, another Admin did it first)

export type ResultMessage = { variant: "success" | "info" | "error"; text: string };

type Kind = "block" | "unblock" | "nick" | "delete" | "makeAdmin" | "removeAdmin";

const DONE: Record<Kind, string> = {
  block: "Cuenta bloqueada: no podrá entrar en su siguiente petición.",
  unblock: "Cuenta desbloqueada.",
  nick: "Nick cambiado.",
  // The list says it instead (DELETED_NOTICE): the action goes back there when it is done
  delete: "Cuenta borrada.",
  // requireAdmin reads the role from the database on every request (#99)
  makeAdmin: "Ahora es administrador: verá el panel de administración en su siguiente petición.",
  removeAdmin: "Ya no es administrador: dejará de ver el panel de administración en su siguiente petición.",
};

// On the list, after the account page's delete action brought the Admin back (?deleted=1)
export const DELETED_NOTICE = DONE.delete;

// deleteAccount always says changed: true, so delete has no "already" message
const ALREADY: Record<Exclude<Kind, "delete">, string> = {
  block: "La cuenta ya estaba bloqueada.",
  unblock: "La cuenta ya estaba desbloqueada.",
  nick: "Ese ya era su nick.",
  // Another Admin got there first: the only way to get changed: false
  makeAdmin: "Ya era administrador: otro administrador se lo dio antes.",
  removeAdmin: "Ya no es administrador: otro administrador se lo quitó antes.",
};

// self and last-admin refuse blocking, deleting and removing the Admin role; club-manager
// refuses making someone an Admin. The other actions never return them
const SELF: Partial<Record<Kind, string>> = {
  block: "No puedes bloquear tu propia cuenta.",
  delete: "No puedes borrar tu propia cuenta.",
  removeAdmin: "No puedes quitar el rol de administrador a tu propia cuenta.",
  // Only reachable with a request sent by hand: the own account page has no role button
  makeAdmin: "No puedes cambiar el rol de tu propia cuenta.",
};
const LAST_ADMIN: Partial<Record<Kind, string>> = {
  block: "No se puede bloquear al último administrador sin bloquear.",
  delete: "No se puede borrar al último administrador sin bloquear.",
  removeAdmin: "No se puede quitar el rol de administrador al último administrador sin bloquear.",
};
const CLUB_MANAGER: Partial<Record<Kind, string>> = {
  makeAdmin: "Es Manager de un club: quítale antes el rol de Manager.",
};

// Every refusal but not-found (one text for all) and invalid-nick (its form shows it on the
// field): a new reason without its texts does not compile
type Refusal = Exclude<Exclude<UpdateNickResult, { ok: true }>["reason"], "not-found" | "invalid-nick">;
const REFUSALS: Record<Refusal, Partial<Record<Kind, string>>> = {
  self: SELF,
  "last-admin": LAST_ADMIN,
  "club-manager": CLUB_MANAGER,
};

// null before the first submit, and for an invalid nick (its form shows it on the field)
export function resultMessage(kind: Kind, result: AccountActionResult | UpdateNickResult | null): ResultMessage | null {
  if (!result) return null;
  if (result.ok) {
    if (result.changed || kind === "delete") return { variant: "success", text: DONE[kind] };
    return { variant: "info", text: ALREADY[kind] };
  }
  if (result.reason === "not-found") return { variant: "error", text: "Esta cuenta ya no existe." };
  const text = result.reason === "invalid-nick" ? undefined : REFUSALS[result.reason][kind];
  return text ? { variant: "error", text } : null;
}
