import { Card } from "@/components/ui/Card";
import type { UserMembershipRequest } from "@/lib/org/organization-repository";
import { InvitationAnswerButtons } from "./InvitationAnswerButtons";
import { formatDate } from "./request-status";

// The invitations the user has received and not answered. Reusable: /club shows it with or
// without a club, since an invitation is only for someone who is not yet in that club (#218)
export function PendingInvitations({ invitations }: { invitations: UserMembershipRequest[] }) {
  if (invitations.length === 0) return null;

  return (
    <section aria-labelledby="invitations-heading" className="flex flex-col gap-4">
      <h2 id="invitations-heading" className="font-heading text-xl font-semibold">
        Invitaciones recibidas
      </h2>
      <ul className="flex flex-col gap-3">
        {invitations.map((invitation) => (
          <li key={invitation.id}>
            <Card className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <p className="font-heading font-semibold">{invitation.orgName}</p>
                <p className="text-sm text-text-secondary">Te invitó el {formatDate(invitation.createdAt)}</p>
              </div>
              <InvitationAnswerButtons requestId={invitation.id} />
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
