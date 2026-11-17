import {
  AdminCannotBeManagerError,
  AlreadyMemberError,
  MembershipRequestNotFoundError,
  MembershipRequestNotPendingError,
  OrganizationNotFoundError,
  organizationRepository,
  RequestAlreadyPendingError,
  UserNotFoundError,
  type MembershipRequestDetail,
  type OrganizationDetail,
  type OrganizationRepository,
  type OrganizationSummary,
} from "./organization-repository";
import { PrismaClubExit } from "./club-exit";
import { createOrganizationSchema, normalizeId, updateOrganizationSchema } from "./schemas";

// What the service needs from PrismaClubExit; a test passes a fake
type ClubExit = Pick<PrismaClubExit, "leave" | "expel">;

// Defined in the repository (which also throws it); re-exported to keep this import path
export {
  AdminCannotBeManagerError,
  AlreadyMemberError,
  MembershipRequestNotFoundError,
  MembershipRequestNotPendingError,
  OrganizationNotFoundError,
  RequestAlreadyPendingError,
  UserNotFoundError,
};

/**
 * Domain service for clubs (#148).
 * Precondition: callers (Server Actions or API route handlers) must check the
 * permission first: requireAuth() (#46) for the catalog, requireOrgRole(orgId,
 * ORG_ROLES["organization.read"]) for a club's page. This service does not.
 */
export class OrganizationService {
  constructor(
    private readonly repo: OrganizationRepository = organizationRepository,
    private readonly clubExit: ClubExit = new PrismaClubExit(),
  ) {}

  // Any signed-in user, member of a club or not
  listCatalog(): Promise<OrganizationSummary[]> {
    return this.repo.listCatalog();
  }

  async getOrganization(orgId: string): Promise<OrganizationDetail> {
    const organization = await this.repo.findById(orgId);
    if (!organization) {
      throw new OrganizationNotFoundError();
    }
    return organization;
  }

  // Admin only: requireAdmin() gives the adminId
  async createOrganization(adminId: string, input: unknown): Promise<OrganizationDetail> {
    const validated = createOrganizationSchema.parse(input);
    if (validated.managerIds.includes(normalizeId(adminId))) {
      throw new AdminCannotBeManagerError();
    }
    return this.repo.createWithManagers(adminId, validated);
  }

  // Admin only: requireAdmin() gives the adminId. No Admin account can be Manager: the acting
  // Admin is rejected here, before reading or writing anything; any other Admin account is
  // rejected by the repository, which reads the role under the user's lock.
  async assignManager(adminId: string, orgId: string, userId: string): Promise<void> {
    if (normalizeId(userId) === normalizeId(adminId)) {
      throw new AdminCannotBeManagerError();
    }
    await this.repo.assignManager(adminId, orgId, userId);
  }

  // Admin only: requireAdmin() gives the adminId. The Manager stays in the club as an athlete;
  // LastManagerError if no other Manager would remain.
  removeManager(adminId: string, orgId: string, userId: string): Promise<void> {
    return this.repo.removeManager(adminId, orgId, userId);
  }

  // Any member: requireOrgRole(orgId, ORG_ROLES["membership.leave"]) gives the userId. Leaving never
  // blocks, not even the last Manager (the Admins are warned); NotMemberError if not in the club.
  leaveClub(userId: string, orgId: string): Promise<void> {
    return this.clubExit.leave(normalizeId(userId), normalizeId(orgId));
  }

  // Manager or Admin: requireOrgRole(orgId, ORG_ROLES["member.expel"]) gives the actor and its role.
  // The expelled user is notified; an Admin's expulsion is audited. NotMemberError if the target
  // is not in the club, CannotExpelSelfError if it is the actor.
  expelMember(actor: { id: string; role: "manager" | "admin" }, orgId: string, targetId: string): Promise<void> {
    return this.clubExit.expel({ ...actor, id: normalizeId(actor.id) }, normalizeId(orgId), normalizeId(targetId));
  }

  // Manager only: requireOrgRole(orgId, ORG_ROLES["organization.updateDescription"])
  async updateOrganization(orgId: string, input: unknown): Promise<OrganizationDetail> {
    const validated = updateOrganizationSchema.parse(input);
    const organization = await this.repo.update(orgId, validated);
    if (!organization) {
      throw new OrganizationNotFoundError();
    }
    return organization;
  }

  // Invitations and requests to join (#149). The service receives a userId: finding someone by
  // email is the UI's job (#152).

  // Manager only: requireOrgRole(orgId, ORG_ROLES["invitation.manage"]) gives the managerId
  inviteUser(managerId: string, orgId: string, userId: string): Promise<MembershipRequestDetail> {
    return this.repo.inviteUser(managerId, orgId, userId);
  }

  // Manager only: requireOrgRole(orgId, ORG_ROLES["invitation.manage"])
  revokeInvitation(orgId: string, requestId: string): Promise<void> {
    return this.repo.revokeInvitation(orgId, requestId);
  }

  // Any signed-in user who is not a member: requireAuth(), not requireOrgRole (they are not in the club)
  requestToJoin(userId: string, orgId: string): Promise<MembershipRequestDetail> {
    return this.repo.requestToJoin(userId, orgId);
  }

  // Signed-in user, for their own request: requireAuth()
  withdrawRequest(userId: string, requestId: string): Promise<void> {
    return this.repo.withdrawRequest(userId, requestId);
  }

  // Signed-in user, for their own invitation: requireAuth(). Accepting makes them an athlete.
  answerInvitation(userId: string, requestId: string, accept: boolean): Promise<void> {
    return this.repo.answerInvitation(userId, requestId, accept);
  }

  // Manager only: requireOrgRole(orgId, ORG_ROLES["membershipRequest.review"]). Approving makes
  // the user an athlete.
  reviewRequest(orgId: string, requestId: string, approve: boolean): Promise<void> {
    return this.repo.reviewRequest(orgId, requestId, approve);
  }

  // Manager only: requireOrgRole(orgId, ORG_ROLES["membershipRequest.review"])
  listPendingRequests(orgId: string): Promise<MembershipRequestDetail[]> {
    return this.repo.listPendingRequests(orgId);
  }
}
