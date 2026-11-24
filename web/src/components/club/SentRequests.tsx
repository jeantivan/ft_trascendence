import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { UserMembershipRequest } from "@/lib/org/organization-repository";
import { REQUEST_STATUS, formatDate } from "./request-status";
import { WithdrawRequestButton } from "./WithdrawRequestButton";

// The requests the user sent, with how each one ended; only a pending one can be withdrawn
export function SentRequests({ requests }: { requests: UserMembershipRequest[] }) {
  if (requests.length === 0) return null;

  return (
    <section aria-labelledby="sent-requests-heading" className="flex flex-col gap-4">
      <h2 id="sent-requests-heading" className="font-heading text-xl font-semibold">
        Mis solicitudes enviadas
      </h2>
      <ul className="flex flex-col gap-3">
        {requests.map((request) => {
          const status = REQUEST_STATUS[request.status];
          return (
            <li key={request.id}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <p className="font-heading font-semibold">{request.orgName}</p>
                  <p className="text-sm text-text-secondary">Enviada el {formatDate(request.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {request.status === "pending" && <WithdrawRequestButton requestId={request.id} />}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
