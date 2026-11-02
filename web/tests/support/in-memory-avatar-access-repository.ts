import type { AvatarAccessRepository } from "@/lib/uploads/avatar-access-repository";

export class InMemoryAvatarAccessRepository implements AvatarAccessRepository {
  private memberships: { userId: string; orgId: string }[] = [];
  private contacts: { userA: string; userB: string; status: "pending" | "accepted" }[] = [];
  // How many questions were asked, to check that some cases skip the database
  queries = 0;

  addMembership(userId: string, orgId: string): void {
    this.memberships.push({ userId, orgId });
  }

  // Stored as given: the fake must find the pair in either order, like the real one
  addContact(userA: string, userB: string, status: "pending" | "accepted"): void {
    this.contacts.push({ userA, userB, status });
  }

  async shareAClub(userId: string, otherId: string): Promise<boolean> {
    this.queries++;
    for (const mine of this.memberships) {
      for (const theirs of this.memberships) {
        if (mine.userId === userId && theirs.userId === otherId && mine.orgId === theirs.orgId) {
          return true;
        }
      }
    }
    return false;
  }

  async areAcceptedContacts(userId: string, otherId: string): Promise<boolean> {
    this.queries++;
    for (const contact of this.contacts) {
      const samePair =
        (contact.userA === userId && contact.userB === otherId) ||
        (contact.userA === otherId && contact.userB === userId);
      if (samePair && contact.status === "accepted") {
        return true;
      }
    }
    return false;
  }
}
