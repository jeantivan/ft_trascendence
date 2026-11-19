import { describe, expect, it, vi } from "vitest";
import {
  AdminCannotBeManagerError,
  OrganizationDeletionAlreadyScheduledError,
  OrganizationDeletionNotScheduledError,
  OrganizationNotFoundError,
  OrganizationService,
} from "@/lib/org/organization-service";
import { LastManagerError, UserNotFoundError } from "@/lib/org/organization-repository";
import type { MailMessage, MailSender } from "@/lib/mail/mail-sender";
import { InMemoryOrganizationRepository } from "../support/in-memory-organization-repository";

const UNKNOWN_ID = "33333333-3333-4333-8333-333333333333";
const CLUB = {
  name: "Club de prueba",
  description: "Salimos los martes",
  timezone: "Europe/Madrid",
  members: 3,
};

const ADMIN_ID = "00000000-0000-4000-8000-0000000000aa";
const MANAGER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_MANAGER_ID = "00000000-0000-4000-8000-000000000002";
const NEW_CLUB = {
  name: "Club nuevo",
  description: "Salimos los viernes",
  timezone: "Europe/Madrid",
  managerIds: [MANAGER_ID],
};

function createService(mailSender?: MailSender) {
  const repo = new InMemoryOrganizationRepository();
  return { service: new OrganizationService(repo, mailSender), repo };
}

describe("OrganizationService", () => {
  it("listCatalog returns the clubs with their member count", async () => {
    const { service, repo } = createService();
    const id = repo.add(CLUB);

    await expect(service.listCatalog()).resolves.toEqual([
      { id, name: CLUB.name, description: CLUB.description, deleteAt: null, memberCount: 3 },
    ]);
  });

  it("getOrganization returns the club's record", async () => {
    const { service, repo } = createService();
    const id = repo.add(CLUB);

    await expect(service.getOrganization(id)).resolves.toEqual({
      id,
      name: CLUB.name,
      description: CLUB.description,
      timezone: CLUB.timezone,
      deleteAt: null,
    });
  });

  it("getOrganization throws OrganizationNotFoundError if the club does not exist", async () => {
    const { service } = createService();

    await expect(service.getOrganization(UNKNOWN_ID)).rejects.toBeInstanceOf(
      OrganizationNotFoundError,
    );
  });

  it("updateOrganization saves description and time zone and returns the new record", async () => {
    const { service, repo } = createService();
    const id = repo.add(CLUB);

    const updated = await service.updateOrganization(id, {
      description: "Ahora salimos los jueves",
      timezone: "Europe/London",
    });

    expect(updated).toEqual({
      id,
      name: CLUB.name,
      description: "Ahora salimos los jueves",
      timezone: "Europe/London",
      deleteAt: null,
    });
    await expect(service.getOrganization(id)).resolves.toEqual(updated);
  });

  it("updateOrganization rejects invalid data and does not change the club", async () => {
    const { service, repo } = createService();
    const id = repo.add(CLUB);

    await expect(
      service.updateOrganization(id, { description: "a".repeat(501), timezone: "Europe/London" }),
    ).rejects.toThrow();
    await expect(
      service.updateOrganization(id, { description: null, timezone: "Mars/Olympus" }),
    ).rejects.toThrow();
    await expect(service.getOrganization(id)).resolves.toMatchObject({
      description: CLUB.description,
      timezone: CLUB.timezone,
    });
  });

  it("updateOrganization throws OrganizationNotFoundError if the club does not exist", async () => {
    const { service } = createService();

    await expect(
      service.updateOrganization(UNKNOWN_ID, { description: null, timezone: "Europe/London" }),
    ).rejects.toBeInstanceOf(OrganizationNotFoundError);
  });

  it("createOrganization creates the club and returns its record", async () => {
    const { service, repo } = createService();
    repo.addUser(MANAGER_ID);

    const created = await service.createOrganization(ADMIN_ID, NEW_CLUB);

    expect(created).toEqual({
      id: expect.any(String),
      name: NEW_CLUB.name,
      description: NEW_CLUB.description,
      timezone: NEW_CLUB.timezone,
      deleteAt: null,
    });
    await expect(service.getOrganization(created.id)).resolves.toEqual(created);
  });

  it("createOrganization does not let the Admin name themselves Manager and creates nothing", async () => {
    const { service } = createService();

    await expect(
      service.createOrganization(ADMIN_ID, { ...NEW_CLUB, managerIds: [MANAGER_ID, ADMIN_ID] }),
    ).rejects.toBeInstanceOf(AdminCannotBeManagerError);
    await expect(service.listCatalog()).resolves.toEqual([]);
  });

  it("createOrganization rejects the Admin's id in upper case and creates nothing", async () => {
    const { service } = createService();

    await expect(
      service.createOrganization(ADMIN_ID, { ...NEW_CLUB, managerIds: [ADMIN_ID.toUpperCase()] }),
    ).rejects.toBeInstanceOf(AdminCannotBeManagerError);
    await expect(service.listCatalog()).resolves.toEqual([]);
  });

  it("createOrganization rejects an upper-case Admin id given by the session", async () => {
    const { service } = createService();

    await expect(
      service.createOrganization(ADMIN_ID.toUpperCase(), { ...NEW_CLUB, managerIds: [ADMIN_ID] }),
    ).rejects.toBeInstanceOf(AdminCannotBeManagerError);
  });

  it("createOrganization throws UserNotFoundError if a Manager does not exist and creates nothing", async () => {
    const { service } = createService();

    await expect(
      service.createOrganization(ADMIN_ID, { ...NEW_CLUB, managerIds: [UNKNOWN_ID] }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
    await expect(service.listCatalog()).resolves.toEqual([]);
  });

  it("assignManager rejects the Admin's id in upper case and changes nothing", async () => {
    const { service, repo } = createService();
    const orgId = repo.add(CLUB);
    repo.addUser(ADMIN_ID);

    await expect(service.assignManager(ADMIN_ID, orgId, ADMIN_ID.toUpperCase())).rejects.toBeInstanceOf(
      AdminCannotBeManagerError,
    );
    await expect(repo.listManagerIds(orgId)).resolves.toEqual([]);
  });

  it("assignManager rejects another Admin account, which only the repository can tell", async () => {
    const { service, repo } = createService();
    const orgId = repo.add(CLUB);
    repo.addAdmin(OTHER_MANAGER_ID);

    await expect(service.assignManager(ADMIN_ID, orgId, OTHER_MANAGER_ID)).rejects.toBeInstanceOf(
      AdminCannotBeManagerError,
    );
    await expect(repo.listManagerIds(orgId)).resolves.toEqual([]);
  });

  it("assignManager makes the user a Manager of the club", async () => {
    const { service, repo } = createService();
    const orgId = repo.add(CLUB);
    repo.addUser(MANAGER_ID);

    await service.assignManager(ADMIN_ID, orgId, MANAGER_ID);

    await expect(repo.listManagerIds(orgId)).resolves.toEqual([MANAGER_ID]);
  });

  it("assignManager does not let the Admin name themselves Manager and changes nothing", async () => {
    const { service, repo } = createService();
    const orgId = repo.add(CLUB);
    // Even a registered user (so the repository would accept it) is rejected before it
    repo.addUser(ADMIN_ID);

    await expect(service.assignManager(ADMIN_ID, orgId, ADMIN_ID)).rejects.toBeInstanceOf(
      AdminCannotBeManagerError,
    );
    await expect(repo.listManagerIds(orgId)).resolves.toEqual([]);
  });

  it("removeManager leaves the Manager as an athlete when another Manager remains", async () => {
    const { service, repo } = createService();
    const orgId = repo.add(CLUB);
    repo.addUser(MANAGER_ID);
    repo.addUser(OTHER_MANAGER_ID);
    await service.assignManager(ADMIN_ID, orgId, MANAGER_ID);
    await service.assignManager(ADMIN_ID, orgId, OTHER_MANAGER_ID);

    await service.removeManager(ADMIN_ID, orgId, MANAGER_ID);

    await expect(repo.listManagerIds(orgId)).resolves.toEqual([OTHER_MANAGER_ID]);
  });

  it("removeManager on the last Manager throws LastManagerError and keeps the Manager", async () => {
    const { service, repo } = createService();
    const orgId = repo.add(CLUB);
    repo.addUser(MANAGER_ID);
    await service.assignManager(ADMIN_ID, orgId, MANAGER_ID);

    await expect(service.removeManager(ADMIN_ID, orgId, MANAGER_ID)).rejects.toBeInstanceOf(LastManagerError);
    await expect(repo.listManagerIds(orgId)).resolves.toEqual([MANAGER_ID]);
  });

  it("createOrganization rejects invalid data (no Managers) and creates nothing", async () => {
    const { service } = createService();

    await expect(
      service.createOrganization(ADMIN_ID, { ...NEW_CLUB, managerIds: [] }),
    ).rejects.toThrow();
    await expect(service.listCatalog()).resolves.toEqual([]);
  });

  it("scheduleDeletion sets deleteAt, sends notice emails and rejects a second schedule", async () => {
    const sent: MailMessage[] = [];
    const mailSender: MailSender = {
      send: async (message) => {
        sent.push(message);
      },
    };
    const { service, repo } = createService(mailSender);
    const orgId = repo.add(CLUB);
    vi.spyOn(repo, "scheduleDeletion").mockResolvedValueOnce({
      orgId,
      orgName: CLUB.name,
      deleteAt: new Date("2026-12-19T00:00:00.000Z"),
      memberEmails: ["a@example.com", "b@example.com"],
    });

    const result = await service.scheduleDeletion(ADMIN_ID, orgId);

    expect(result.deleteAt).toEqual(new Date("2026-12-19T00:00:00.000Z"));
    expect(sent).toHaveLength(2);
    expect(sent.map((m) => m.to)).toEqual(["a@example.com", "b@example.com"]);
    expect(sent[0].subject).toContain(CLUB.name);
    expect(sent[0].text).toContain("30 días");

    await service.scheduleDeletion(ADMIN_ID, orgId);
    await expect(service.scheduleDeletion(ADMIN_ID, orgId)).rejects.toBeInstanceOf(
      OrganizationDeletionAlreadyScheduledError,
    );
  });

  it("scheduleDeletion still succeeds if sending a notice email fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mailSender: MailSender = {
      send: async (message) => {
        if (message.to === "fail@example.com") throw new Error("smtp down");
      },
    };
    const { service, repo } = createService(mailSender);
    const orgId = repo.add(CLUB);
    vi.spyOn(repo, "scheduleDeletion").mockResolvedValueOnce({
      orgId,
      orgName: CLUB.name,
      deleteAt: new Date("2026-12-19T00:00:00.000Z"),
      memberEmails: ["ok@example.com", "fail@example.com"],
    });

    await expect(service.scheduleDeletion(ADMIN_ID, orgId)).resolves.toMatchObject({ orgId });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("1 notice email(s) failed"));
    warn.mockRestore();
  });

  it("cancelDeletion clears deleteAt and rejects when no deletion is scheduled", async () => {
    const { service, repo } = createService();
    const orgId = repo.add(CLUB);

    await expect(service.cancelDeletion(ADMIN_ID, orgId)).rejects.toBeInstanceOf(
      OrganizationDeletionNotScheduledError,
    );

    await service.scheduleDeletion(ADMIN_ID, orgId);
    await expect(service.getOrganization(orgId)).resolves.toMatchObject({
      deleteAt: expect.any(Date),
    });

    await service.cancelDeletion(ADMIN_ID, orgId);
    await expect(service.getOrganization(orgId)).resolves.toMatchObject({ deleteAt: null });
  });
});
