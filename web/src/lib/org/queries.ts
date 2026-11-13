import "server-only";
import { notFound } from "next/navigation";
import { ORG_ROLES } from "@/lib/permissions/org-roles";
import { requireAuth } from "@/lib/permissions/require-auth";
import { requireOrgRole } from "@/lib/permissions/require-org-role";
import type { OrganizationDetail, OrganizationSummary } from "./organization-repository";
import { OrganizationNotFoundError, OrganizationService } from "./organization-service";

// Club reads for Server Components (pages). Not a "use server" file: those exports would become
// public endpoints, and reads need none. "server-only" makes the build fail if a Client Component
// imports this module.
const organizationService = new OrganizationService();

// Any signed-in user, member of a club or not
export async function getCatalog(): Promise<OrganizationSummary[]> {
  // Outside try/catch: it redirects by throwing
  await requireAuth();
  return organizationService.listCatalog();
}

// Members of the club and the Admin. A club the user cannot see (not a member, malformed id,
// made-up id) ends in 404 inside requireOrgRole
export async function getOrganizationPage(orgId: string): Promise<OrganizationDetail> {
  // Outside try/catch: it redirects, 404s or 403s by throwing
  await requireOrgRole(orgId, ORG_ROLES["organization.read"]);

  try {
    return await organizationService.getOrganization(orgId);
  } catch (error) {
    // The club was deleted after the permission check
    if (error instanceof OrganizationNotFoundError) {
      notFound();
    }
    throw error;
  }
}
