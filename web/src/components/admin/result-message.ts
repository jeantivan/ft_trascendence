import type { AccountActionResult, UpdateNickResult } from "@/lib/admin/accounts";

// What the Admin panel (#102) says after each action. "changed: false" means the
// account was already like that (for example, another Admin did it first)

export type ResultMessage = { variant: "success" | "info" | "error"; text: string };

type Kind = "block" | "unblock" | "nick";

const DONE: Record<Kind, string> = {
  block: "Cuenta bloqueada: no podrá entrar en su siguiente petición.",
  unblock: "Cuenta desbloqueada.",
  nick: "Nick cambiado.",
};

const ALREADY: Record<Kind, string> = {
  block: "La cuenta ya estaba bloqueada.",
  unblock: "La cuenta ya estaba desbloqueada.",
  nick: "Ese ya era su nick.",
};

// null before the first submit, and for an invalid nick (its form shows it on the field)
export function resultMessage(kind: Kind, result: AccountActionResult | UpdateNickResult | null): ResultMessage | null {
  if (!result) return null;
  if (result.ok) return { variant: result.changed ? "success" : "info", text: (result.changed ? DONE : ALREADY)[kind] };
  if (result.reason === "self") return { variant: "error", text: "No puedes bloquear tu propia cuenta." };
  if (result.reason === "not-found") return { variant: "error", text: "Esta cuenta ya no existe." };
  return null;
}
