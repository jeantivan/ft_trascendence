import type {
  AuthUser,
  CreateUserInput,
  UserRepository,
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
      throw new Error("User with this email already exists");
    }

    const newUser: AuthUser = {
      id: crypto.randomUUID(),
      email: input.email.toLowerCase().trim(),
      passwordHash: input.passwordHash,
      nick: input.nick.trim(),
      role_global: "user",
      blockedAt: null,
    };

    this.users.set(newUser.id, newUser);
    return newUser;
  }
}
