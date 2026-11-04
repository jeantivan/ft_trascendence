import type { CurrentUser } from "@/lib/permissions/current-user";
import {
  avatarAccessRepository,
  type AvatarAccessRepository,
} from "@/lib/uploads/avatar-access-repository";

// Who can see whose avatar, as agreed on #23: the owner, an Admin, anyone who
// shares a club with the owner (Managers too) and the owner's accepted Contacts.
// viewer must come from requireApiAuth, which reads roleGlobal from the database
// on every request, not from the JWT.
export async function canViewAvatar(
  viewer: CurrentUser,
  ownerId: string,
  repo: AvatarAccessRepository = avatarAccessRepository
): Promise<boolean> {
  // The cheap checks first: they need no query
  if (viewer.id === ownerId) {
    return true;
  }
  if (viewer.roleGlobal === "admin") {
    return true;
  }
  // Both queries at once (PR #88 review): the wait is the slower one, not the
  // sum. Both always run, even when the first one is already true.
  const [shareAClub, areContacts] = await Promise.all([
    repo.shareAClub(viewer.id, ownerId),
    repo.areAcceptedContacts(viewer.id, ownerId),
  ]);
  return shareAClub || areContacts;
}
