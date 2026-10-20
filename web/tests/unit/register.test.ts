import { beforeEach, describe, expect, it } from "vitest";
import { registerUser } from "@/lib/auth/register";
import { InMemoryUserRepository } from "../support/in-memory-user-repository";

describe("registerUser logic", () => {
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  it("successfully registers a user with valid data and hashed password", async () => {
    const result = await registerUser(
      {
        email: "runner@42madrid.com",
        password: "securePassword123!",
        nick: "fastrunner",
      },
      repo
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.user.email).toBe("runner@42madrid.com");
      expect(result.user.nick).toBe("fastrunner");
      expect(result.user.passwordHash).not.toBe("securePassword123!");
      expect(result.user.passwordHash).toMatch(/^\$2[abxy]\$/);
    }
  });

  it("fails when email is already registered", async () => {
    await registerUser(
      {
        email: "runner@42madrid.com",
        password: "securePassword123!",
        nick: "fastrunner",
      },
      repo
    );

    const duplicateResult = await registerUser(
      {
        email: "runner@42madrid.com",
        password: "otherPassword123!",
        nick: "othernick",
      },
      repo
    );

    expect(duplicateResult.success).toBe(false);
    if (!duplicateResult.success) {
      expect(duplicateResult.error).toBe("El email ya está registrado");
    }
  });

  it("fails when input validation fails (e.g. short password)", async () => {
    const result = await registerUser(
      {
        email: "runner@42madrid.com",
        password: "short",
        nick: "fastrunner",
      },
      repo
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});
