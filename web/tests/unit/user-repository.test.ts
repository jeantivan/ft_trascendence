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
    expect(user.roleGlobal).toBe("user");

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

  it("finds a user by id and returns null when not found", async () => {
    const user = await repo.createUser({
      email: "runner@42madrid.com",
      passwordHash: "hash123",
      nick: "fastrunner",
    });

    const found = await repo.findById(user.id);
    expect(found).toEqual(user);

    const notFound = await repo.findById("unknown-id");
    expect(notFound).toBeNull();
  });

  it("updates nick, email and password", async () => {
    const user = await repo.createUser({
      email: "runner@42madrid.com",
      passwordHash: "hash123",
      nick: "fastrunner",
    });

    const updatedNick = await repo.updateNick(user.id, "super-runner");
    expect(updatedNick.nick).toBe("super-runner");

    const updatedEmail = await repo.updateEmail(user.id, "new@42madrid.com");
    expect(updatedEmail.email).toBe("new@42madrid.com");

    const updatedPassword = await repo.updatePassword(user.id, "newHashedPassword");
    expect(updatedPassword.passwordHash).toBe("newHashedPassword");
  });

  it("throws when updating email to an existing email", async () => {
    const user1 = await repo.createUser({
      email: "runner1@42madrid.com",
      passwordHash: "hash1",
      nick: "runner1",
    });
    await repo.createUser({
      email: "runner2@42madrid.com",
      passwordHash: "hash2",
      nick: "runner2",
    });

    await expect(
      repo.updateEmail(user1.id, "runner2@42madrid.com")
    ).rejects.toThrow("User with this email already exists");
  });
});

describe("PrismaUserRepository", () => {
  const mockPrismaUser = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
      roleGlobal: "user",
      image: null,
      blockedAt: null,
      statsPublic: false,
      showOnline: true,
      notificationsEnabled: true,
      healthConsentAt: null,
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

    expect(user.roleGlobal).toBe("user");
    expect(mockPrismaUser.create).toHaveBeenCalledWith({
      data: {
        email: "new@42.com",
        passwordHash: "newHash",
        nick: "newrunner",
      },
    });
  });

  it("finds a user by id", async () => {
    mockPrismaUser.findUnique.mockResolvedValueOnce({
      id: "u123",
      email: "id@42.com",
      passwordHash: "hash123",
      nick: "runner-id",
      roleGlobal: "user",
      blockedAt: null,
    });

    const user = await repo.findById("u123");
    expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
      where: { id: "u123" },
    });
    expect(user?.id).toBe("u123");
  });

  it("updates nick with trimming", async () => {
    mockPrismaUser.update.mockResolvedValueOnce({
      id: "u123",
      email: "id@42.com",
      passwordHash: "hash123",
      nick: "trimmed-nick",
      roleGlobal: "user",
      blockedAt: null,
    });

    const user = await repo.updateNick("u123", "  trimmed-nick  ");
    expect(mockPrismaUser.update).toHaveBeenCalledWith({
      where: { id: "u123" },
      data: { nick: "trimmed-nick" },
    });
    expect(user.nick).toBe("trimmed-nick");
  });

  it("updates email and handles P2002 duplicate error", async () => {
    mockPrismaUser.update.mockResolvedValueOnce({
      id: "u123",
      email: "newemail@42.com",
      passwordHash: "hash123",
      nick: "runner",
      roleGlobal: "user",
      blockedAt: null,
    });

    const user = await repo.updateEmail("u123", "  NEWEMAIL@42.COM  ");
    expect(mockPrismaUser.update).toHaveBeenCalledWith({
      where: { id: "u123" },
      data: { email: "newemail@42.com" },
    });
    expect(user.email).toBe("newemail@42.com");

    mockPrismaUser.update.mockRejectedValueOnce({ code: "P2002" });
    await expect(
      repo.updateEmail("u123", "taken@42.com")
    ).rejects.toThrow("User with this email already exists");
  });

  it("updates password hash", async () => {
    mockPrismaUser.update.mockResolvedValueOnce({
      id: "u123",
      email: "id@42.com",
      passwordHash: "newHash321",
      nick: "runner",
      roleGlobal: "user",
      blockedAt: null,
    });

    const user = await repo.updatePassword("u123", "newHash321");
    expect(mockPrismaUser.update).toHaveBeenCalledWith({
      where: { id: "u123" },
      data: { passwordHash: "newHash321" },
    });
    expect(user.passwordHash).toBe("newHash321");
  });
});
