import { randomUUID } from "node:crypto";
import {
  AlreadyManagerError,
  LastManagerError,
  NotManagerError,
  OrganizationNameTakenError,
  OrganizationNotFoundError,
  UserNotFoundError,
  type OrganizationDetail,
  type OrganizationEdit,
  type OrganizationRepository,
  type OrganizationSummary,
} from "@/lib/org/organization-repository";
import type { CreateOrganizationInput } from "@/lib/org/schemas";
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
  members: Map<string, Role>;
}

export class InMemoryOrganizationRepository implements OrganizationRepository {
  private clubs: Map<string, StoredClub> = new Map();
  // Memory has no users table: the fixture registers the users that exist
  private users: Set<string> = new Set();

  addUser(userId: string): void {
    this.users.add(userId);
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
    this.clubs.set(id, { data, members });
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
    // Like the unique index on organizations.name
    if ([...this.clubs.values()].some((club) => club.data.name === input.name)) {
      throw new OrganizationNameTakenError();
    }
    const id = this.store(
      { name: input.name, description: input.description, timezone: input.timezone },
      new Map(input.managerIds.map((userId) => [userId, "manager" as Role])),
    );
    return { id, name: input.name, description: input.description, timezone: input.timezone };
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
    };
  }

  async assignManager(_adminId: string, orgId: string, userId: string): Promise<void> {
    const members = this.memberRoles(orgId, userId);
    if (members.get(userId) === "manager") throw new AlreadyManagerError();
    members.set(userId, "manager");
  }

  async removeManager(_adminId: string, orgId: string, userId: string): Promise<void> {
    const members = this.memberRoles(orgId, userId);
    if (members.get(userId) !== "manager") throw new NotManagerError();
    if ((await this.listManagerIds(orgId)).length === 1) throw new LastManagerError();
    members.set(userId, "athlete");
  }

  async listManagerIds(orgId: string): Promise<string[]> {
    const members = this.clubs.get(orgId)?.members ?? new Map<string, Role>();
    return [...members].filter(([, role]) => role === "manager").map(([userId]) => userId);
  }
}
