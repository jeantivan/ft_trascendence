import { randomUUID } from "node:crypto";
import {
  AdminCannotBeManagerError,
  AlreadyManagerError,
  AlreadyMemberError,
  LastManagerError,
  MembershipRequestNotFoundError,
  MembershipRequestNotPendingError,
  RequestAlreadyPendingError,
  NotManagerError,
  OrganizationDeletionAlreadyScheduledError,
  OrganizationDeletionNotScheduledError,
  OrganizationNameTakenError,
  OrganizationNotFoundError,
  UserNotFoundError,
  type MembershipRequestDetail,
  type OrganizationDetail,
  type OrganizationEdit,
  type OrganizationRepository,
  type OrganizationSummary,
  type ScheduleDeletionResult,
  DAY_MS,
  DELETION_NOTICE_DAYS,
} from "@/lib/org/organization-repository";
import {
  MEMBERSHIP_ACCEPTED,
  MEMBERSHIP_INVITATION_CREATED,
  MEMBERSHIP_REQUEST_CREATED,
} from "@/lib/org/membership-notifier";
import type { NotifyInput } from "@/lib/notifications/notify";
import { normalizeId, type CreateOrganizationInput } from "@/lib/org/schemas";
import type { NewClub } from "./organization-repository-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Like Prisma on a @db.Uuid column, which throws P2023 for a malformed id
function assertUuid(id: string): void {
  if (!UUID.test(id)) {
    throw new Error("P2023: malformed UUID");
  }
}

type Role = "athlete" | "manager";

// A club as stored: its data, and each member's role by user id
interface StoredClub {
  data: Omit<NewClub, "members">;
  deleteAt: Date | null;
  members: Map<string, Role>;
}

export class InMemoryOrganizationRepository implements OrganizationRepository {
  private clubs: Map<string, StoredClub> = new Map();
  // Memory has no users table: the fixture registers the users that exist
  private users: Set<string> = new Set();
  // The registered users that are Admin accounts
  private admins: Set<string> = new Set();
  // The registered users that are blocked
  private blocked: Set<string> = new Set();
  private requests: Map<string, MembershipRequestDetail> = new Map();
  // What the notifier received, like the fake notify() of the Prisma tests
  readonly sent: NotifyInput[] = [];

  addUser(userId: string): void {
    this.users.add(normalizeId(userId));
  }

  addAdmin(userId: string): void {
    this.addUser(userId);
    this.admins.add(normalizeId(userId));
  }

  block(userId: string): void {
    this.blocked.add(normalizeId(userId));
  }

  // Like the Prisma implementation: the user is checked first, then the club
  private memberRoles(orgId: string, userId: string): Map<string, Role> {
    if (!this.users.has(userId)) throw new UserNotFoundError();
    const club = this.clubs.get(orgId);
    if (!club) throw new OrganizationNotFoundError();
    return club.members;
  }

  // Puts a club in, with club.members athletes, and returns its id
  add(club: NewClub): string {
    const { members, ...data } = club;
    const athletes = Array.from({ length: members }, () => [randomUUID(), "athlete" as Role] as const);
    return this.store(data, new Map(athletes));
  }

  private store(data: StoredClub["data"], members: Map<string, Role>): string {
    const id = randomUUID();
    this.clubs.set(id, { data, deleteAt: null, members });
    return id;
  }

  // Makes an existing user an athlete member of an existing club
  addAthlete(orgId: string, userId: string): void {
    this.clubs.get(orgId)?.members.set(userId, "athlete");
  }

  async listCatalog(): Promise<OrganizationSummary[]> {
    return [...this.clubs].map(([id, club]) => ({
      id,
      name: club.data.name,
      description: club.data.description,
      deleteAt: club.deleteAt,
      memberCount: club.members.size,
    }));
  }

  async update(orgId: string, data: OrganizationEdit): Promise<OrganizationDetail | null> {
    assertUuid(orgId);
    const club = this.clubs.get(orgId);
    if (!club) return null;
    this.clubs.set(orgId, { ...club, data: { ...club.data, ...data } });
    return this.findById(orgId);
  }

  // No audit here: it only exists in the database, and its test is there
  async createWithManagers(
    _adminId: string,
    input: CreateOrganizationInput,
  ): Promise<OrganizationDetail> {
    // Like Postgres, ids are compared without regard to capitalization
    const managerIds = [...new Set(input.managerIds.map(normalizeId))];
    // Like the database: a Manager that does not exist stops the creation, nothing is created
    if (managerIds.some((userId) => !this.users.has(userId))) throw new UserNotFoundError();
    if (managerIds.some((userId) => this.admins.has(userId))) throw new AdminCannotBeManagerError();
    // Like the unique index on organizations.name
    if ([...this.clubs.values()].some((club) => club.data.name === input.name)) {
      throw new OrganizationNameTakenError();
    }
    const id = this.store(
      { name: input.name, description: input.description, timezone: input.timezone },
      new Map(managerIds.map((userId) => [userId, "manager" as Role])),
    );
    return { id, name: input.name, description: input.description, timezone: input.timezone, deleteAt: null };
  }

  async findById(orgId: string): Promise<OrganizationDetail | null> {
    assertUuid(orgId);
    const club = this.clubs.get(orgId);
    if (!club) return null;
    return {
      id: orgId,
      name: club.data.name,
      description: club.data.description,
      timezone: club.data.timezone,
      deleteAt: club.deleteAt,
    };
  }

  async assignManager(_adminId: string, orgId: string, userId: string): Promise<void> {
    orgId = normalizeId(orgId);
    userId = normalizeId(userId);
    const members = this.memberRoles(orgId, userId);
    const club = this.clubs.get(orgId);
    if (this.admins.has(userId)) throw new AdminCannotBeManagerError();
    if (members.get(userId) === "manager") throw new AlreadyManagerError();
    if (!members.has(userId) && club && club.deleteAt !== null) {
      throw new OrganizationDeletionAlreadyScheduledError();
    }
    members.set(userId, "manager");
  }

  async removeManager(_adminId: string, orgId: string, userId: string): Promise<void> {
    orgId = normalizeId(orgId);
    userId = normalizeId(userId);
    const members = this.memberRoles(orgId, userId);
    if (members.get(userId) !== "manager") throw new NotManagerError();
    if ((await this.listManagerIds(orgId)).length === 1) throw new LastManagerError();
    members.set(userId, "athlete");
  }

  async listManagerIds(orgId: string): Promise<string[]> {
    const members = this.clubs.get(orgId)?.members ?? new Map<string, Role>();
    return [...members].filter(([, role]) => role === "manager").map(([userId]) => userId);
  }

  async scheduleDeletion(
    _adminId: string,
    orgId: string,
    now: Date = new Date(),
  ): Promise<ScheduleDeletionResult> {
    orgId = normalizeId(orgId);
    assertUuid(orgId);
    const club = this.clubs.get(orgId);
    if (!club) throw new OrganizationNotFoundError();
    if (club.deleteAt !== null) throw new OrganizationDeletionAlreadyScheduledError();
    const deleteAt = new Date(now.getTime() + DELETION_NOTICE_DAYS * DAY_MS);
    club.deleteAt = deleteAt;
    // The fake has no user emails, so it never has anyone to mail; the service's email path is
    // tested with the service's own mail sender
    return { orgId, orgName: club.data.name, deleteAt, memberEmails: [] };
  }

  async cancelDeletion(
    _adminId: string,
    orgId: string,
    now: Date = new Date(),
  ): Promise<void> {
    orgId = normalizeId(orgId);
    assertUuid(orgId);
    const club = this.clubs.get(orgId);
    if (!club) throw new OrganizationNotFoundError();
    if (club.deleteAt === null || club.deleteAt <= now) {
      throw new OrganizationDeletionNotScheduledError();
    }
    club.deleteAt = null;
  }

  // Blocked reads like missing, like the database one
  private assertUserCanJoin(userId: string): void {
    if (!this.users.has(userId) || this.blocked.has(userId)) throw new UserNotFoundError();
  }

  private create(
    creatorId: string,
    orgId: string,
    userId: string,
    kind: "invite" | "request",
  ): MembershipRequestDetail {
    this.assertUserCanJoin(userId);
    const club = this.clubs.get(orgId);
    if (!club) throw new OrganizationNotFoundError();
    if (club.deleteAt !== null) throw new OrganizationDeletionAlreadyScheduledError();
    if (club.members.has(userId)) throw new AlreadyMemberError();
    const pending = [...this.requests.values()].some(
      (request) => request.orgId === orgId && request.userId === userId && request.status === "pending",
    );
    if (pending) throw new RequestAlreadyPendingError();
    const request: MembershipRequestDetail = {
      id: randomUUID(),
      orgId,
      userId,
      kind,
      status: "pending",
      createdBy: creatorId,
      createdAt: new Date(),
    };
    this.requests.set(request.id, request);
    const payload = { orgId, requestId: request.id };
    if (kind === "invite") {
      this.sent.push({ userId, type: MEMBERSHIP_INVITATION_CREATED, payload });
    } else {
      for (const [managerId, role] of club.members) {
        if (role === "manager") this.sent.push({ userId: managerId, type: MEMBERSHIP_REQUEST_CREATED, payload });
      }
    }
    return { ...request };
  }

  async inviteUser(managerId: string, orgId: string, userId: string): Promise<MembershipRequestDetail> {
    return this.create(normalizeId(managerId), normalizeId(orgId), normalizeId(userId), "invite");
  }

  async requestToJoin(userId: string, orgId: string): Promise<MembershipRequestDetail> {
    userId = normalizeId(userId);
    return this.create(userId, normalizeId(orgId), userId, "request");
  }

  // Same checks as the conditional update: not found, then not pending
  private decide(
    requestId: string,
    owns: (request: MembershipRequestDetail) => boolean,
    status: "accepted" | "rejected" | "revoked",
  ): MembershipRequestDetail {
    const request = this.requests.get(normalizeId(requestId));
    if (!request || !owns(request)) throw new MembershipRequestNotFoundError();
    if (request.status !== "pending") throw new MembershipRequestNotPendingError();
    request.status = status;
    return request;
  }

  private join(request: MembershipRequestDetail): void {
    this.assertUserCanJoin(request.userId);
    const members = this.clubs.get(request.orgId)?.members;
    if (!members) throw new OrganizationNotFoundError();
    if (members.has(request.userId)) throw new AlreadyMemberError();
    members.set(request.userId, "athlete");
  }

  async revokeInvitation(orgId: string, requestId: string): Promise<void> {
    orgId = normalizeId(orgId);
    this.decide(requestId, (r) => r.orgId === orgId && r.kind === "invite", "revoked");
  }

  async withdrawRequest(userId: string, requestId: string): Promise<void> {
    userId = normalizeId(userId);
    this.decide(requestId, (r) => r.userId === userId && r.kind === "request", "revoked");
  }

  async answerInvitation(userId: string, requestId: string, accept: boolean): Promise<void> {
    userId = normalizeId(userId);
    const request = this.requests.get(normalizeId(requestId));
    // Like the transaction: a failed join leaves the invitation pending
    if (accept && request?.userId === userId && request.kind === "invite" && request.status === "pending") {
      this.join(request);
    }
    const decided = this.decide(requestId, (r) => r.userId === userId && r.kind === "invite", accept ? "accepted" : "rejected");
    if (accept && decided.createdBy) {
      this.sent.push({
        userId: decided.createdBy,
        type: MEMBERSHIP_ACCEPTED,
        payload: { orgId: decided.orgId, requestId: decided.id, userId: decided.userId },
      });
    }
  }

  async reviewRequest(orgId: string, requestId: string, approve: boolean): Promise<void> {
    orgId = normalizeId(orgId);
    const request = this.requests.get(normalizeId(requestId));
    if (approve && request?.orgId === orgId && request.kind === "request" && request.status === "pending") {
      this.join(request);
    }
    const decided = this.decide(requestId, (r) => r.orgId === orgId && r.kind === "request", approve ? "accepted" : "rejected");
    if (approve) {
      this.sent.push({
        userId: decided.userId,
        type: MEMBERSHIP_ACCEPTED,
        payload: { orgId: decided.orgId, requestId: decided.id, userId: decided.userId },
      });
    }
  }

  async listPendingRequests(orgId: string): Promise<MembershipRequestDetail[]> {
    orgId = normalizeId(orgId);
    return [...this.requests.values()]
      .filter((r) => r.orgId === orgId && r.kind === "request" && r.status === "pending")
      .map((r) => ({ ...r }));
  }
}
