import {
  type AuthUser,
  type CreateUserInput,
  UserAlreadyExistsError,
  type UserRepository,
} from "@/lib/auth/user-repository";

export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, AuthUser> = new Map();

  async findByEmail(email: string): Promise<AuthUser | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    return this.users.get(id) ?? null;
  }

  async createUser(input: CreateUserInput): Promise<AuthUser> {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      throw new UserAlreadyExistsError("User with this email already exists");
    }

    const newUser: AuthUser = {
      id: crypto.randomUUID(),
      email: input.email.toLowerCase().trim(),
      passwordHash: input.passwordHash,
      nick: input.nick.trim(),
      roleGlobal: "user",
      image: null,
      blockedAt: null,
      statsPublic: false,
      showOnline: true,
      notificationsEnabled: true,
      healthConsentAt: null,
    };

    this.users.set(newUser.id, newUser);
    return newUser;
  }

  async updateNick(id: string, nick: string): Promise<AuthUser> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const updated: AuthUser = { ...user, nick: nick.trim() };
    this.users.set(id, updated);
    return updated;
  }

  async updateEmail(id: string, email: string): Promise<AuthUser> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const normalized = email.toLowerCase().trim();
    for (const [existingId, existing] of this.users.entries()) {
      if (existingId !== id && existing.email.toLowerCase() === normalized) {
        throw new UserAlreadyExistsError("User with this email already exists");
      }
    }
    const updated: AuthUser = { ...user, email: normalized };
    this.users.set(id, updated);
    return updated;
  }

  async updatePassword(id: string, passwordHash: string | null): Promise<AuthUser> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const updated: AuthUser = { ...user, passwordHash };
    this.users.set(id, updated);
    return updated;
  }
}
