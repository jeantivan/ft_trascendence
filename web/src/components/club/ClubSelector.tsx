import Link from "next/link";
import { cn } from "@/lib/cn";
import type { UserClub } from "@/lib/org/organization-repository";

// Switches between the user's clubs through ?org=<id>; the page validates it on the server.
// Shown only to members of more than one club (#219)
export function ClubSelector({ clubs, currentOrgId }: { clubs: UserClub[]; currentOrgId: string }) {
  if (clubs.length < 2) return null;

  return (
    <nav aria-label="Mis clubes" className="flex flex-wrap gap-2">
      {clubs.map((club) => (
        <Link
          key={club.orgId}
          href={`/club?org=${club.orgId}`}
          aria-current={club.orgId === currentOrgId ? "page" : undefined}
          className={cn(
            "rounded-full border px-4 py-2 font-heading text-sm transition-colors",
            club.orgId === currentOrgId
              ? "border-volt bg-volt/10 text-volt"
              : "border-border-strong text-text-secondary hover:border-volt hover:text-volt",
          )}
        >
          {club.name}
        </Link>
      ))}
    </nav>
  );
}
