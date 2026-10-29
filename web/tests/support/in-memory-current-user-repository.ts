import type {
  CurrentUserRecord,
  CurrentUserRepository,
} from "@/lib/permissions/current-user-repository";

export class InMemoryCurrentUserRepository implements CurrentUserRepository {
  private users: Map<string, CurrentUserRecord> = new Map();

  add(user: CurrentUserRecord): void {
    this.users.set(user.id, user);
  }

  async findById(id: string): Promise<CurrentUserRecord | null> {
    // Like Prisma's findUnique, which throws when the id is missing
    if (!id) {
      throw new Error("findById needs an id");
    }
    return this.users.get(id) ?? null;
  }
}
