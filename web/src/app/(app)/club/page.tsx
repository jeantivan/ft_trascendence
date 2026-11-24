import { ClubDirectory } from "@/components/club/ClubDirectory";
import { PendingInvitations } from "@/components/club/PendingInvitations";
import { SentRequests } from "@/components/club/SentRequests";
import { getCatalog, getMyMembershipRequests, userHasClub } from "@/lib/org/queries";

// The user without a club (#218) sees the invitations they received, the requests they sent
// and the directory; the choice is made here, on the server. The view of a member is a later ticket
export default async function ClubPage() {
  if (await userHasClub()) {
    return <h1 className="font-heading text-3xl font-semibold">Club</h1>;
  }

  const [clubs, { invitations, sentRequests }] = await Promise.all([getCatalog(), getMyMembershipRequests()]);
  const pending = new Map(
    [...invitations, ...sentRequests.filter((r) => r.status === "pending")].map((r) => [r.orgId, r]),
  );

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-heading text-3xl font-semibold">Club</h1>
      <PendingInvitations invitations={invitations} />
      <SentRequests requests={sentRequests} />
      <ClubDirectory clubs={clubs} pending={pending} />
    </div>
  );
}
