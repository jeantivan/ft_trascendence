import { beforeEach, describe, expect, it } from "vitest";
import { authorizeCredentials } from "@/lib/auth/credentials";
import { hashPassword } from "@/lib/auth/password";
import { InMemoryUserRepository } from "../support/in-memory-user-repository";

describe("authorizeCredentials", () => {
  let repo: InMemoryUserRepository;

  beforeEach(async () => {
    repo = new InMemoryUserRepository();
    const passwordHash = await hashPassword("correctPassword123!");
    await repo.createUser({
      email: "athlete@42madrid.com",
      passwordHash,
      nick: "athlete42",
    });
  });

  it("authenticates successfully with valid credentials", async () => {
    const user = await authorizeCredentials(
      {
        email: "athlete@42madrid.com",
        password: "correctPassword123!",
      },
      repo
    );

    expect(user).not.toBeNull();
    expect(user?.email).toBe("athlete@42madrid.com");
    expect(user?.nick).toBe("athlete42");
    expect(user?.roleGlobal).toBe("user");
  });

  it("returns null with wrong password", async () => {
    const user = await authorizeCredentials(
      {
        email: "athlete@42madrid.com",
        password: "wrongPassword",
      },
      repo
    );

    expect(user).toBeNull();
  });

  it("returns null with non-existent email", async () => {
    const user = await authorizeCredentials(
      {
        email: "unknown@42madrid.com",
        password: "correctPassword123!",
      },
      repo
    );

    expect(user).toBeNull();
  });

  it("returns null if user is blocked (blockedAt is set)", async () => {
    // Directly inject a user with blockedAt set
    const blockedUser = await repo.createUser({
      email: "blocked@42madrid.com",
      passwordHash: await hashPassword("correctPassword123!"),
      nick: "blockedUser",
    });
    blockedUser.blockedAt = new Date();

    const user = await authorizeCredentials(
      {
        email: "blocked@42madrid.com",
        password: "correctPassword123!",
      },
      repo
    );

    expect(user).toBeNull();
  });

  it("returns null with invalid input format", async () => {
    const user = await authorizeCredentials(
      {
        email: "not-an-email",
        password: "",
      },
      repo
    );

    expect(user).toBeNull();
  });
});
