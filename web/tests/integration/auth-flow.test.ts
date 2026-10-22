import { beforeEach, describe, expect, it } from "vitest";
import { registerUser } from "@/lib/auth/register";
import { authorizeCredentials } from "@/lib/auth/credentials";
import { InMemoryUserRepository } from "../support/in-memory-user-repository";

describe("Integration: Authentication Flow", () => {
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  it("completes full lifecycle: registration, credential validation and password verification", async () => {
    // 1. Registro con datos válidos y hasheado real con bcrypt
    const registerResult = await registerUser(
      {
        email: "marathoner@42madrid.com",
        password: "SuperSecretPassword42!",
        nick: "marathoner",
      },
      repo
    );

    expect(registerResult.success).toBe(true);
    if (!registerResult.success) return;

    expect(registerResult.user.email).toBe("marathoner@42madrid.com");
    expect(registerResult.user.passwordHash).not.toBe("SuperSecretPassword42!");

    // 2. Intento de inicio de sesión con credenciales correctas
    const authSuccess = await authorizeCredentials(
      {
        email: "marathoner@42madrid.com",
        password: "SuperSecretPassword42!",
      },
      repo
    );

    expect(authSuccess).not.toBeNull();
    expect(authSuccess?.email).toBe("marathoner@42madrid.com");
    expect(authSuccess?.nick).toBe("marathoner");
    expect(authSuccess?.roleGlobal).toBe("user");

    // 3. Intento de inicio de sesión con contraseña errónea
    const authWrongPassword = await authorizeCredentials(
      {
        email: "marathoner@42madrid.com",
        password: "WrongPassword123!",
      },
      repo
    );
    expect(authWrongPassword).toBeNull();

    // 4. Intento de registro duplicado con el mismo correo
    const duplicateRegister = await registerUser(
      {
        email: "MARATHONER@42madrid.com",
        password: "AnotherPassword123!",
        nick: "copycat",
      },
      repo
    );
    expect(duplicateRegister.success).toBe(false);
    if (!duplicateRegister.success) {
      expect(duplicateRegister.error).toBe("El email ya está registrado");
    }

    // 5. Suspensión de cuenta: un usuario bloqueado no puede autenticarse
    const registeredUser = await repo.findByEmail("marathoner@42madrid.com");
    if (registeredUser) {
      registeredUser.blockedAt = new Date();
    }

    const authBlockedUser = await authorizeCredentials(
      {
        email: "marathoner@42madrid.com",
        password: "SuperSecretPassword42!",
      },
      repo
    );
    expect(authBlockedUser).toBeNull();
  });
});
