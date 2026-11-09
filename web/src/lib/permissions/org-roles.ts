import type { OrgRole } from "./org-role";

// Club-level rows of the permission matrix (issue #2), the source of truth:
// if the matrix changes, change it here too (tests/unit/permissions/org-roles.test.ts).
// Only who may act by club role. Conditions such as "only their own" or
// "with health consent" are checked by each feature's service.
// "admin": an Admin who is not a member may act in that row (#100); the route
// gets role "admin". The rest of the Admin's actions go through requireAdmin (#50),
// such as creating, updating or deleting a club and naming its Managers.
// Not club-level, checked elsewhere: users without a club (joining requests,
// accepting an invitation: they are not members yet), Contacts, DM, profile
// photos and notifications.
// Usage: requireOrgRole(orgId, ORG_ROLES["group.write"])
export const ORG_ROLES = {
  "organization.read": ["manager", "athlete", "admin"],
  "organization.updateDescription": ["manager"],
  // Accounts of the club's members
  "member.read": ["manager"],
  "member.expel": ["manager", "admin"],
  // Last Manager leaving: the Admin is notified
  "membership.leave": ["manager", "athlete"],
  // Create and revoke
  "invitation.manage": ["manager"],
  // Read, approve and reject
  "membershipRequest.review": ["manager"],
  // Athlete: only their Groups
  "group.read": ["manager", "athlete", "admin"],
  // Create, update and assigning Athletes
  "group.write": ["manager"],
  // Its own row because the Admin may delete but not create or update
  "group.delete": ["manager", "admin"],
  // Athlete: only the assigned ones
  "trainingTemplate.read": ["manager", "athlete"],
  "trainingTemplate.write": ["manager"],
  // Template and Customized Sessions. Athlete: only their own
  "session.read": ["manager", "athlete"],
  // Only sessions not completed yet
  "session.write": ["manager"],
  // Athlete: only their own
  "freeSession.read": ["manager", "athlete"],
  // Only their own
  "freeSession.write": ["athlete"],
  // Athlete: only their own
  "sessionMetrics.read": ["manager", "athlete"],
  // Only their own; RPE only with health consent
  "sessionMetrics.write": ["athlete"],
  // Includes the number of attendees
  "event.read": ["manager", "athlete", "admin"],
  // Names of the attendees
  "event.readAttendees": ["manager"],
  // Create and update
  "event.write": ["manager"],
  // Its own row because the Admin may delete but not create or update
  "event.delete": ["manager", "admin"],
  // Read, approve and reject
  "spotRequest.review": ["manager"],
  // Create, withdraw and read their own
  "spotRequest.request": ["athlete"],
  // Read and write: there is no separate eventChat.read row. Athlete: only if admitted to the Event
  "eventChat.post": ["manager", "athlete"],
  // Delete messages and expel from the chat. Admin: only reported messages,
  // checked by the chat route with role "admin" (#50)
  "eventChat.moderate": ["manager", "admin"],
  // Manager: only the ones they wrote. Athlete: their own
  "feedback.read": ["manager", "athlete"],
  // Only their own and only with the Athlete's health consent
  "feedback.write": ["manager"],
  "clubProfile.read": ["manager", "athlete"],
  // Only their own (opt-in)
  "clubProfile.update": ["athlete"],
} as const satisfies Record<string, readonly OrgRole[]>;
