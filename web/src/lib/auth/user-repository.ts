import { prisma } from "@/lib/prisma";
import type { PrismaClient, GlobalRole } from "@/generated/prisma/client";

export interface AuthUser {
  id: string;
  email: string;
  passwordHash: string | null;
  nick: string;
  roleGlobal: GlobalRole;
  blockedAt?: Date | null;
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
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  private toAuthUser(user: {
    id: string;
    email: string;
    passwordHash: string | null;
    nick: string | null;
    roleGlobal: GlobalRole;
    blockedAt: Date | null;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      nick: user.nick ?? "",
      roleGlobal: user.roleGlobal,
      blockedAt: user.blockedAt,
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
    const user = await this.db.user.create({
      data: {
        email: input.email.toLowerCase().trim(),
        passwordHash: input.passwordHash,
        nick: input.nick.trim(),
      },
    });
    return this.toAuthUser(user);
  }
}

export const userRepository: UserRepository = new PrismaUserRepository();
