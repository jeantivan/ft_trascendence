import type { MembershipRequestStatus } from "@/generated/prisma/client";
import type { BadgeVariant } from "@/components/ui/Badge";

// How /club writes the state of a request the user sent
export const REQUEST_STATUS: Record<MembershipRequestStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pendiente", variant: "info" },
  accepted: { label: "Aceptada", variant: "success" },
  rejected: { label: "Rechazada", variant: "destructive" },
  revoked: { label: "Retirada", variant: "neutral" },
};

// Always dd/mm/yyyy, like the Admin panel
const dateFormat = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDate(date: Date): string {
  return dateFormat.format(date);
}
