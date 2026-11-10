import { userRepository, type UserRepository, type AuthUser } from "@/lib/auth/user-repository";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  updateNickSchema,
  updateEmailSchema,
  updatePasswordSchema,
  type UpdateNickInput,
  type UpdateEmailInput,
  type UpdatePasswordInput,
} from "./schemas";

export class UserNotFoundError extends Error {
  constructor(message = "User not found or blocked") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

export class MissingCurrentPasswordError extends Error {
  constructor(message = "Current password is required") {
    super(message);
    this.name = "MissingCurrentPasswordError";
  }
}

export class InvalidCurrentPasswordError extends Error {
  constructor(message = "Current password is incorrect") {
    super(message);
    this.name = "InvalidCurrentPasswordError";
  }
}

export class EmailChangeNotAllowedForOAuthError extends Error {
  constructor(
    message = "No se permite cambiar el email en cuentas registradas exclusivamente con OAuth"
  ) {
    super(message);
    this.name = "EmailChangeNotAllowedForOAuthError";
  }
}

export interface SettingsProfile {
  id: string;
  email: string;
  nick: string;
  image: string | null;
  hasPassword: boolean;
  statsPublic: boolean;
  showOnline: boolean;
  notificationsEnabled: boolean;
  healthConsentAt: Date | null;
  healthConsentVersion: number | null;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

/**
 * Domain service for managing profile and credentials settings (#129).
 * Precondition: callers (Server Actions or API route handlers) must invoke
 * `requireAuth()` (#46) first to guarantee `userId` comes from an authenticated session.
 */
export class UserSettingsService {
  constructor(
    private readonly repo: UserRepository = userRepository,
    private readonly hasher: PasswordHasher = {
      hash: hashPassword,
      verify: verifyPassword,
    }
  ) {}

  private toSettingsProfile(user: AuthUser): SettingsProfile {
    return {
      id: user.id,
      email: user.email,
      nick: user.nick,
      image: user.image ?? null,
      hasPassword: user.passwordHash !== null,
      statsPublic: user.statsPublic ?? false,
      showOnline: user.showOnline ?? true,
      notificationsEnabled: user.notificationsEnabled ?? true,
      healthConsentAt: user.healthConsentAt ?? null,
      healthConsentVersion: user.healthConsentVersion ?? null,
    };
  }

  private async getActiveUser(userId: string): Promise<AuthUser> {
    const user = await this.repo.findById(userId);
    if (!user || (user.blockedAt !== null && user.blockedAt !== undefined)) {
      throw new UserNotFoundError();
    }
    return user;
  }

  private async verifyCurrentPasswordIfRequired(
    user: AuthUser,
    currentPassword?: string
  ): Promise<void> {
    if (user.passwordHash === null) return;

    if (!currentPassword) {
      throw new MissingCurrentPasswordError("Se requiere la contraseña actual");
    }
    const matches = await this.hasher.verify(currentPassword, user.passwordHash);
    if (!matches) {
      throw new InvalidCurrentPasswordError("La contraseña actual es incorrecta");
    }
  }

  async getProfile(userId: string): Promise<SettingsProfile> {
    const user = await this.getActiveUser(userId);
    return this.toSettingsProfile(user);
  }

  async updateNick(userId: string, input: UpdateNickInput): Promise<SettingsProfile> {
    const validated = updateNickSchema.parse(input);
    await this.getActiveUser(userId);
    const updated = await this.repo.updateNick(userId, validated.nick);
    return this.toSettingsProfile(updated);
  }

  /**
   * Updates the user's email address.
   * Callers must verify session via `requireAuth()` (#46).
   * Solo-OAuth accounts (passwordHash === null) cannot change email directly (anti-takeover security #66).
   */
  async updateEmail(userId: string, input: UpdateEmailInput): Promise<SettingsProfile> {
    const validated = updateEmailSchema.parse(input);
    const user = await this.getActiveUser(userId);

    if (user.passwordHash === null) {
      throw new EmailChangeNotAllowedForOAuthError();
    }

    await this.verifyCurrentPasswordIfRequired(user, validated.currentPassword);

    const updated = await this.repo.updateEmail(userId, validated.email);
    return this.toSettingsProfile(updated);
  }

  async updatePassword(userId: string, input: UpdatePasswordInput): Promise<void> {
    const validated = updatePasswordSchema.parse(input);
    const user = await this.getActiveUser(userId);

    await this.verifyCurrentPasswordIfRequired(user, validated.currentPassword);

    const newHash = await this.hasher.hash(validated.newPassword);
    await this.repo.updatePassword(userId, newHash);
  }
}

export const userSettingsService = new UserSettingsService();
