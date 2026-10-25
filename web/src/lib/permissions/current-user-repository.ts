import type { GlobalRole } from "@/generated/prisma/client";

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
