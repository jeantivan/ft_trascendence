import {
  OrganizationNotFoundError,
  organizationRepository,
  type OrganizationDetail,
  type OrganizationRepository,
  type OrganizationSummary,
} from "./organization-repository";
import { createOrganizationSchema, updateOrganizationSchema } from "./schemas";

// Defined in the repository (which also throws it); re-exported to keep this import path
export { OrganizationNotFoundError };

export class AdminCannotBeManagerError extends Error {
  constructor(message = "The Admin cannot name themselves Manager") {
    super(message);
    this.name = "AdminCannotBeManagerError";
  }
}

/**
 * Domain service for clubs (#148).
 * Precondition: callers (Server Actions or API route handlers) must check the
 * permission first: requireAuth() (#46) for the catalog, requireOrgRole(orgId,
 * ORG_ROLES["organization.read"]) for a club's page. This service does not.
 */
export class OrganizationService {
  constructor(private readonly repo: OrganizationRepository = organizationRepository) {}

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
    if (validated.managerIds.includes(adminId)) {
      throw new AdminCannotBeManagerError();
    }
    return this.repo.createWithManagers(adminId, validated);
  }

  // Admin only: requireAdmin() gives the adminId. The Admin cannot name themselves Manager;
  // the check comes first, so the rejection reads and writes nothing.
  async assignManager(adminId: string, orgId: string, userId: string): Promise<void> {
    if (userId === adminId) {
      throw new AdminCannotBeManagerError();
    }
    await this.repo.assignManager(adminId, orgId, userId);
  }

  // Admin only: requireAdmin() gives the adminId. The Manager stays in the club as an athlete;
  // LastManagerError if no other Manager would remain.
  removeManager(adminId: string, orgId: string, userId: string): Promise<void> {
    return this.repo.removeManager(adminId, orgId, userId);
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
}
