import { prisma } from "@/lib/prisma";
import type { PrismaClient, GlobalRole } from "@/generated/prisma/client";

// Only the fields requireAuth needs: never passwordHash or totpSecret
export interface CurrentUserRecord {
  id: string;
  email: string;
  nick: string;
  roleGlobal: GlobalRole;
  blockedAt: Date | null;
}

export interface CurrentUserRepository {
  findById(id: string): Promise<CurrentUserRecord | null>;
}

export class PrismaCurrentUserRepository implements CurrentUserRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findById(id: string): Promise<CurrentUserRecord | null> {
    // select keeps secret columns out of memory, not just out of the result
    const user = await this.db.user.findUnique({
      where: { id },
      select: { id: true, email: true, nick: true, roleGlobal: true, blockedAt: true },
    });
    if (!user) return null;
    return { ...user, nick: user.nick ?? "" };
  }
}

export const currentUserRepository: CurrentUserRepository =
  new PrismaCurrentUserRepository();
