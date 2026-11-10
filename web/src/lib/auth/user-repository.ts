import { prisma } from "@/lib/prisma";
import type { PrismaClient, GlobalRole } from "@/generated/prisma/client";

export class UserAlreadyExistsError extends Error {
  constructor(message = "User already exists") {
    super(message);
    this.name = "UserAlreadyExistsError";
  }
}

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string | null;
  nick: string;
  roleGlobal: GlobalRole;
  image?: string | null;
  blockedAt?: Date | null;
  statsPublic?: boolean;
  showOnline?: boolean;
  notificationsEnabled?: boolean;
  healthConsentAt?: Date | null;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  nick: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<AuthUser | null>;
  findById(id: string): Promise<AuthUser | null>;
  createUser(input: CreateUserInput): Promise<AuthUser>;
  updateNick(id: string, nick: string): Promise<AuthUser>;
  updateEmail(id: string, email: string): Promise<AuthUser>;
  updatePassword(id: string, passwordHash: string): Promise<AuthUser>;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  private toAuthUser(user: {
    id: string;
    email: string;
    passwordHash: string | null;
    nick: string | null;
    roleGlobal: GlobalRole;
    image?: string | null;
    blockedAt?: Date | null;
    statsPublic?: boolean;
    showOnline?: boolean;
    notificationsEnabled?: boolean;
    healthConsentAt?: Date | null;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      nick: user.nick ?? "",
      roleGlobal: user.roleGlobal,
      image: user.image ?? null,
      blockedAt: user.blockedAt ?? null,
      statsPublic: user.statsPublic ?? false,
      showOnline: user.showOnline ?? true,
      notificationsEnabled: user.notificationsEnabled ?? true,
      healthConsentAt: user.healthConsentAt ?? null,
    };
  }

  async findByEmail(email: string): Promise<AuthUser | null> {
    const user = await this.db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user) return null;
    return this.toAuthUser(user);
  }

  async findById(id: string): Promise<AuthUser | null> {
    const user = await this.db.user.findUnique({
      where: { id },
    });
    if (!user) return null;
    return this.toAuthUser(user);
  }

  async createUser(input: CreateUserInput): Promise<AuthUser> {
    try {
      const user = await this.db.user.create({
        data: {
          email: input.email.toLowerCase().trim(),
          passwordHash: input.passwordHash,
          nick: input.nick.trim(),
        },
      });
      return this.toAuthUser(user);
    } catch (error: unknown) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
        throw new UserAlreadyExistsError("User with this email already exists");
      }
      throw error;
    }
  }

  async updateNick(id: string, nick: string): Promise<AuthUser> {
    const user = await this.db.user.update({
      where: { id },
      data: { nick: nick.trim() },
    });
    return this.toAuthUser(user);
  }

  async updateEmail(id: string, email: string): Promise<AuthUser> {
    try {
      const user = await this.db.user.update({
        where: { id },
        data: { email: email.toLowerCase().trim() },
      });
      return this.toAuthUser(user);
    } catch (error: unknown) {
      if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
        throw new UserAlreadyExistsError("User with this email already exists");
      }
      throw error;
    }
  }

  async updatePassword(id: string, passwordHash: string): Promise<AuthUser> {
    const user = await this.db.user.update({
      where: { id },
      data: { passwordHash },
    });
    return this.toAuthUser(user);
  }
}

export const userRepository: UserRepository = new PrismaUserRepository();
