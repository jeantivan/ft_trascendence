import { ClubDirectory } from "@/components/club/ClubDirectory";
import { PendingInvitations } from "@/components/club/PendingInvitations";
import { SentRequests } from "@/components/club/SentRequests";
import { ClubHeader } from "@/components/club/ClubHeader";
import { ClubSelector } from "@/components/club/ClubSelector";
import { getCatalog, getMyClubs, getMyMembershipRequests, getOrganizationPage } from "@/lib/org/queries";

// The member (#219) sees the header of one of their clubs, picked with ?org=<id>; the user without
// a club (#218) sees the invitations they received, the requests they sent and the directory.
// The choice is made here, on the server. An ?org that is not one of the user's clubs (made up, or
// the one they just left) falls back to the first one
export default async function ClubPage({ searchParams }: { searchParams: Promise<{ org?: string | string[] }> }) {
  const myClubs = await getMyClubs();
  if (myClubs.length > 0) {
    const { org } = await searchParams;
    const membership = myClubs.find((club) => club.orgId === org) ?? myClubs[0];
    const club = await getOrganizationPage(membership.orgId);
    return (
      <div className="flex flex-col gap-6">
        <ClubSelector clubs={myClubs} currentOrgId={membership.orgId} />
        <ClubHeader club={club} membership={membership} />
      </div>
    );
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
