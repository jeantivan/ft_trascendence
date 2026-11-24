import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { OrganizationSummary, UserMembershipRequest } from "@/lib/org/organization-repository";
import { RequestToJoinButton } from "./RequestToJoinButton";
import { formatDate } from "./request-status";

// Every club, with what the user can do in each one (#218): ask to join, or why not.
// pending: the user's pending invitation or request per club
export function ClubDirectory({
  clubs,
  pending,
}: {
  clubs: OrganizationSummary[];
  pending: Map<string, UserMembershipRequest>;
}) {
  return (
    <section aria-labelledby="directory-heading" className="flex flex-col gap-4">
      <h2 id="directory-heading" className="font-heading text-xl font-semibold">
        Directorio de clubes
      </h2>
      {clubs.length === 0 ? (
        <p className="text-text-secondary">Todavía no hay clubes.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {clubs.map((club) => (
            <li key={club.id}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-heading font-semibold">{club.name}</p>
                  {club.description && <p className="text-sm text-text-secondary">{club.description}</p>}
                  <p className="text-sm text-text-secondary">
                    {club.memberCount} {club.memberCount === 1 ? "miembro" : "miembros"}
                  </p>
                  {club.deleteAt && (
                    <p className="text-sm text-text-secondary">
                      Borrado programado para el {formatDate(club.deleteAt)}: no acepta solicitudes ni invitaciones.
                    </p>
                  )}
                </div>
                <ClubAction club={club} request={pending.get(club.id)} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ClubAction({ club, request }: { club: OrganizationSummary; request: UserMembershipRequest | undefined }) {
  if (club.deleteAt) return <Badge variant="warning">Borrado programado</Badge>;
  if (request?.kind === "invite") return <Badge variant="info">Invitación recibida</Badge>;
  if (request) return <Badge variant="info">Solicitud pendiente</Badge>;
  return <RequestToJoinButton orgId={club.id} />;
}
