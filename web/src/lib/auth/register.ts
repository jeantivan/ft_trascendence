import { hashPassword } from "./password";
import { registerSchema } from "./schemas";
import {
  userRepository,
  UserAlreadyExistsError,
  type AuthUser,
  type UserRepository,
} from "./user-repository";

export type RegisterResult =
  | { success: true; user: AuthUser }
  | { success: false; error: string };

export async function registerUser(
  input: unknown,
  repo: UserRepository = userRepository
): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Datos de registro inválidos";
    return { success: false, error: firstIssue };
  }

  const existing = await repo.findByEmail(parsed.data.email);
  if (existing) {
    return { success: false, error: "El email ya está registrado" };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const user = await repo.createUser({
      email: parsed.data.email,
      passwordHash,
      nick: parsed.data.nick,
    });

    return { success: true, user };
  } catch (error) {
    if (error instanceof UserAlreadyExistsError) {
      return { success: false, error: "El email ya está registrado" };
    }
    throw error;
  }
}
