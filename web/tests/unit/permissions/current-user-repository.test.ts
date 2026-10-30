import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaCurrentUserRepository } from "@/lib/permissions/current-user-repository";
import type { PrismaClient } from "@/generated/prisma/client";

describe("PrismaCurrentUserRepository", () => {
  const mockPrismaUser = { findUnique: vi.fn() };
  const mockDb = { user: mockPrismaUser } as unknown as PrismaClient;
  const repo = new PrismaCurrentUserRepository(mockDb);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects only the fields requireAuth needs, never passwordHash or totpSecret", async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce(null);

    await repo.findById("u1");

    expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { id: true, email: true, nick: true, roleGlobal: true, blockedAt: true },
    });
  });

  it("maps a null nick to an empty string", async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "runner@42.com",
      nick: null,
      roleGlobal: "user",
      blockedAt: null,
    });

    const user = await repo.findById("u1");

    expect(user).toEqual({
      id: "u1",
      email: "runner@42.com",
      nick: "",
      roleGlobal: "user",
      blockedAt: null,
    });
  });
});
