import { verifyPassword } from "./password";
import { loginSchema } from "./schemas";
import { userRepository, type UserRepository } from "./user-repository";

export async function authorizeCredentials(
  credentials: unknown,
  repo: UserRepository = userRepository
) {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) {
    return null;
  }

  const user = await repo.findByEmail(parsed.data.email);
  if (!user || !user.passwordHash || user.blockedAt) {
    return null;
  }

  const isValid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    nick: user.nick,
    roleGlobal: user.roleGlobal,
  };
}
