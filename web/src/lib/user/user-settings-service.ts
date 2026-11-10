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

export class InvalidCurrentPasswordError extends Error {
  constructor(message = "Current password is incorrect") {
    super(message);
    this.name = "InvalidCurrentPasswordError";
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
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
}

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
      hasPassword: user.passwordHash !== null && user.passwordHash.length > 0,
      statsPublic: user.statsPublic ?? false,
      showOnline: user.showOnline ?? true,
      notificationsEnabled: user.notificationsEnabled ?? true,
      healthConsentAt: user.healthConsentAt ?? null,
    };
  }

  private async getActiveUser(userId: string): Promise<AuthUser> {
    const user = await this.repo.findById(userId);
    if (!user || (user.blockedAt !== null && user.blockedAt !== undefined)) {
      throw new UserNotFoundError();
    }
    return user;
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

  async updateEmail(userId: string, input: UpdateEmailInput): Promise<SettingsProfile> {
    const validated = updateEmailSchema.parse(input);
    const user = await this.getActiveUser(userId);

    const hasPassword = user.passwordHash !== null && user.passwordHash.length > 0;
    if (hasPassword) {
      if (!validated.currentPassword) {
        throw new InvalidCurrentPasswordError("Se requiere la contraseña actual");
      }
      const matches = await this.hasher.verify(validated.currentPassword, user.passwordHash!);
      if (!matches) {
        throw new InvalidCurrentPasswordError("La contraseña actual es incorrecta");
      }
    }

    const updated = await this.repo.updateEmail(userId, validated.email);
    return this.toSettingsProfile(updated);
  }

  async updatePassword(userId: string, input: UpdatePasswordInput): Promise<void> {
    const validated = updatePasswordSchema.parse(input);
    const user = await this.getActiveUser(userId);

    const hasPassword = user.passwordHash !== null && user.passwordHash.length > 0;
    if (hasPassword) {
      if (!validated.currentPassword) {
        throw new InvalidCurrentPasswordError("Se requiere la contraseña actual");
      }
      const matches = await this.hasher.verify(validated.currentPassword, user.passwordHash!);
      if (!matches) {
        throw new InvalidCurrentPasswordError("La contraseña actual es incorrecta");
      }
    }

    const newHash = await this.hasher.hash(validated.newPassword);
    await this.repo.updatePassword(userId, newHash);
  }
}

export const userSettingsService = new UserSettingsService();
