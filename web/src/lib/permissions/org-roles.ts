import type { MembershipRole } from "@/generated/prisma/client";

// Club-level rows of the permission matrix (issue #2), the source of truth:
// if the matrix changes, change it here too (tests/unit/permissions/org-roles.test.ts).
// Only who may act by club role. Conditions such as "only their own" or
// "with health consent" are checked by each feature's service.
// Not club-level, checked elsewhere: Admin (requireAdmin, #50), users without
// a club (joining requests, accepting an invitation: they are not members yet),
// Contacts, DM, profile photos and notifications.
// Usage: requireOrgRole(orgId, ORG_ROLES["group.write"])
export const ORG_ROLES = {
  "organization.read": ["manager", "athlete"],
  "organization.updateDescription": ["manager"],
  // Accounts of the club's members
  "member.read": ["manager"],
  "member.expel": ["manager"],
  // Last Manager leaving: the Admin is notified
  "membership.leave": ["manager", "athlete"],
  // Create and revoke
  "invitation.manage": ["manager"],
  // Read, approve and reject
  "membershipRequest.review": ["manager"],
  // Athlete: only their Groups
  "group.read": ["manager", "athlete"],
  // CRUD and assigning Athletes
  "group.write": ["manager"],
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
  "event.read": ["manager", "athlete"],
  // Names of the attendees
  "event.readAttendees": ["manager"],
  "event.write": ["manager"],
  // Read, approve and reject
  "spotRequest.review": ["manager"],
  // Create, withdraw and read their own
  "spotRequest.request": ["athlete"],
  // Read and write. Athlete: only if admitted to the Event
  "eventChat.post": ["manager", "athlete"],
  // Delete messages and expel from the chat
  "eventChat.moderate": ["manager"],
  // Manager: only the ones they wrote. Athlete: their own
  "feedback.read": ["manager", "athlete"],
  // Only their own and only with the Athlete's health consent
  "feedback.write": ["manager"],
  "clubProfile.read": ["manager", "athlete"],
  // Only their own (opt-in)
  "clubProfile.update": ["athlete"],
} as const satisfies Record<string, readonly MembershipRole[]>;
