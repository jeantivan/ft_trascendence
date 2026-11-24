import { Badge } from "@/components/ui/Badge";
import type { OrganizationDetail, UserClub } from "@/lib/org/organization-repository";
import { LeaveClubButton } from "./LeaveClubButton";

// Name, description, time zone and role of the club the member is looking at (#219)
export function ClubHeader({ club, membership }: { club: OrganizationDetail; membership: UserClub }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-semibold">{club.name}</h1>
          <Badge variant={membership.role === "manager" ? "info" : "neutral"}>
            {membership.role === "manager" ? "Manager" : "Atleta"}
          </Badge>
        </div>
        {club.description && <p className="text-text-secondary">{club.description}</p>}
        <p className="text-sm text-text-secondary">Zona horaria: {club.timezone}</p>
      </div>
      <LeaveClubButton orgId={club.id} clubName={club.name} isLastManager={membership.isLastManager} />
    </header>
  );
}
