import type { MailSender } from "@/lib/mail/mail-sender";
import { createSmtpMailSender } from "@/lib/mail/smtp-mail-sender";
import {
  AdminCannotBeManagerError,
  OrganizationDeletionAlreadyScheduledError,
  OrganizationDeletionNotScheduledError,
  OrganizationNotFoundError,
  organizationRepository,
  type OrganizationDetail,
  type OrganizationRepository,
  type OrganizationSummary,
  type ScheduleDeletionResult,
} from "./organization-repository";
import { createOrganizationSchema, normalizeId, updateOrganizationSchema } from "./schemas";

// Defined in the repository (which also throws it); re-exported to keep this import path
export {
  AdminCannotBeManagerError,
  OrganizationDeletionAlreadyScheduledError,
  OrganizationDeletionNotScheduledError,
  OrganizationNotFoundError,
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
    private readonly mailSender?: MailSender,
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

  // Manager only: requireOrgRole(orgId, ORG_ROLES["organization.updateDescription"])
  async updateOrganization(orgId: string, input: unknown): Promise<OrganizationDetail> {
    const validated = updateOrganizationSchema.parse(input);
    const organization = await this.repo.update(orgId, validated);
    if (!organization) {
      throw new OrganizationNotFoundError();
    }
    return organization;
  }

  // Admin only: schedules club deletion in 30 days and notifies every member by email
  async scheduleDeletion(adminId: string, orgId: string): Promise<ScheduleDeletionResult> {
    const result = await this.repo.scheduleDeletion(adminId, orgId);
    if (result.memberEmails.length > 0) {
      await this.sendDeletionNoticeEmails(result);
    }
    return result;
  }

  // Admin only: cancels an active scheduled deletion (deleteAt > now)
  cancelDeletion(adminId: string, orgId: string): Promise<void> {
    return this.repo.cancelDeletion(adminId, orgId);
  }

  private async sendDeletionNoticeEmails(result: ScheduleDeletionResult): Promise<void> {
    const sender = this.mailSender ?? createSmtpMailSender();
    const deleteDate = result.deleteAt.toISOString().slice(0, 10);
    const subject = `Aviso de borrado del club ${result.orgName}`;
    const text =
      `Hola,\n\n` +
      `El administrador de StrideSync ha programado el borrado del club "${result.orgName}" para el ${deleteDate} (con 30 días de antelación).\n` +
      `Hasta esa fecha puedes descargar tus datos desde tu cuenta.\n`;

    const deliveries = await Promise.allSettled(
      result.memberEmails.map((to) => sender.send({ to, subject, text })),
    );
    const failed = deliveries.filter((delivery) => delivery.status === "rejected").length;
    if (failed > 0) {
      console.warn(`Organization deletion scheduled, but ${failed} notice email(s) failed`);
    }
  }
}
