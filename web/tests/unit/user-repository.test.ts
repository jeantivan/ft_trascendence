import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaUserRepository } from "@/lib/auth/user-repository";
import { InMemoryUserRepository } from "../support/in-memory-user-repository";
import type { PrismaClient } from "@/generated/prisma/client";

describe("InMemoryUserRepository", () => {
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  it("creates a user and finds them by email", async () => {
    const user = await repo.createUser({
      email: "runner@42madrid.com",
      passwordHash: "hashedPassword123",
      nick: "fastrunner",
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe("runner@42madrid.com");
    expect(user.nick).toBe("fastrunner");
    expect(user.role_global).toBe("user");

    const found = await repo.findByEmail("runner@42madrid.com");
    expect(found).toEqual(user);
  });

  it("returns null when user is not found", async () => {
    const found = await repo.findByEmail("ghost@42madrid.com");
    expect(found).toBeNull();
  });

  it("throws error when creating a user with already registered email", async () => {
    await repo.createUser({
      email: "runner@42madrid.com",
      passwordHash: "hashedPassword123",
      nick: "fastrunner",
    });

    await expect(
      repo.createUser({
        email: "runner@42madrid.com",
        passwordHash: "otherHash",
        nick: "duplicate",
      })
    ).rejects.toThrow("User with this email already exists");
  });
});

describe("PrismaUserRepository", () => {
  const mockPrismaUser = {
    findUnique: vi.fn(),
    create: vi.fn(),
  };
  const mockDb = { user: mockPrismaUser } as unknown as PrismaClient;
  const repo = new PrismaUserRepository(mockDb);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds a user by email and maps fields correctly", async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: "u1",
      email: "runner@42.com",
      passwordHash: "hash123",
      nick: "runner42",
      roleGlobal: "user",
      blockedAt: null,
    });

    const user = await repo.findByEmail("RUNNER@42.com ");

    expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
      where: { email: "runner@42.com" },
    });
    expect(user).toEqual({
      id: "u1",
      email: "runner@42.com",
      passwordHash: "hash123",
      nick: "runner42",
      role_global: "user",
      blockedAt: null,
    });
  });

  it("creates a user and returns AuthUser", async () => {
    mockPrismaUser.create.mockResolvedValueOnce({
      id: "u2",
      email: "new@42.com",
      passwordHash: "newHash",
      nick: "newrunner",
      roleGlobal: "user",
      blockedAt: null,
    });

    const user = await repo.createUser({
      email: "new@42.com",
      passwordHash: "newHash",
      nick: "newrunner",
    });

    expect(user.role_global).toBe("user");
    expect(mockPrismaUser.create).toHaveBeenCalledWith({
      data: {
        email: "new@42.com",
        passwordHash: "newHash",
        nick: "newrunner",
      },
    });
  });
});
