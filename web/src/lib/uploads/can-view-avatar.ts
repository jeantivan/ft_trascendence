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
  // One after the other, not in parallel: most viewers share a club with the
  // owner, so the Contacts query is usually skipped. In parallel it would always
  // run, to save about a millisecond only when the first answer is no.
  if (await repo.shareAClub(viewer.id, ownerId)) {
    return true;
  }
  return repo.areAcceptedContacts(viewer.id, ownerId);
}
