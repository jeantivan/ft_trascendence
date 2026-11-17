import type { GlobalRole, MembershipRole } from "@/generated/prisma/client";

// How the Admin panel (#102) writes dates and roles, the same on every page

// Always dd/mm/yyyy, so the dates line up in the list
const dateFormat = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

// One label per role: a new role in the schema makes tsc ask for its label
const GLOBAL_ROLE_LABELS: Record<GlobalRole, string> = { admin: "Administrador", user: "Usuario" };
const CLUB_ROLE_LABELS: Record<MembershipRole, string> = { manager: "Manager", athlete: "Athlete" };

export function globalRoleLabel(role: GlobalRole): string {
  return GLOBAL_ROLE_LABELS[role];
}

export function clubRoleLabel(role: MembershipRole): string {
  return CLUB_ROLE_LABELS[role];
}
