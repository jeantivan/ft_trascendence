import {
  type AuthUser,
  type CreateUserInput,
  type UpdatePrivacySettingsInput,
  UserAlreadyExistsError,
  type UserRepository,
} from "@/lib/auth/user-repository";
import { stripCardiacMetrics } from "@/lib/user/strip-cardiac-metrics";

export interface InMemoryAuditLogEntry {
  actorId: string;
  subjectId: string | null;
  actorRole: null;
  action: string;
  resource: string;
  createdAt: Date;
}

export interface InMemorySessionLog {
  id: string;
  athleteId: string;
  completed: boolean;
  rpe: number | null;
  distanceM?: number | null;
  durationS?: number | null;
  extra?: Record<string, unknown> | null;
}

export interface InMemoryFeedback {
  id: string;
  athleteId: string;
  body: string;
}

export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, AuthUser> = new Map();
  public auditLogs: InMemoryAuditLogEntry[] = [];
  public sessionLogs: InMemorySessionLog[] = [];
  public feedbacks: InMemoryFeedback[] = [];

  async findByEmail(email: string): Promise<AuthUser | null> {
    const normalized = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.email.toLowerCase() === normalized) {
        return user;
      }
    }
    return null;
  }

  async findById(id: string): Promise<AuthUser | null> {
    return this.users.get(id) ?? null;
  }

  async createUser(input: CreateUserInput): Promise<AuthUser> {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      throw new UserAlreadyExistsError("User with this email already exists");
    }

    const newUser: AuthUser = {
      id: crypto.randomUUID(),
      email: input.email.toLowerCase().trim(),
      passwordHash: input.passwordHash ?? null,
      nick: input.nick.trim(),
      roleGlobal: "user",
      image: null,
      blockedAt: null,
      statsPublic: false,
      showOnline: true,
      notificationsEnabled: true,
      healthConsentAt: null,
      healthConsentVersion: null,
    };

    this.users.set(newUser.id, newUser);
    return newUser;
  }

  async updateNick(id: string, nick: string): Promise<AuthUser> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const updated: AuthUser = { ...user, nick: nick.trim() };
    this.users.set(id, updated);
    return updated;
  }

  async updateEmail(id: string, email: string): Promise<AuthUser> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const normalized = email.toLowerCase().trim();
    for (const [existingId, existing] of this.users.entries()) {
      if (existingId !== id && existing.email.toLowerCase() === normalized) {
        throw new UserAlreadyExistsError("User with this email already exists");
      }
    }
    const updated: AuthUser = { ...user, email: normalized };
    this.users.set(id, updated);
    return updated;
  }

  async updatePassword(id: string, passwordHash: string): Promise<AuthUser> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const updated: AuthUser = { ...user, passwordHash };
    this.users.set(id, updated);
    return updated;
  }

  async updatePrivacy(id: string, settings: UpdatePrivacySettingsInput): Promise<AuthUser> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const updated: AuthUser = {
      ...user,
      ...(settings.statsPublic !== undefined && { statsPublic: settings.statsPublic }),
      ...(settings.showOnline !== undefined && { showOnline: settings.showOnline }),
      ...(settings.notificationsEnabled !== undefined && { notificationsEnabled: settings.notificationsEnabled }),
    };
    this.users.set(id, updated);
    return updated;
  }

  async giveHealthConsent(id: string, version: number): Promise<AuthUser> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const updated: AuthUser = {
      ...user,
      healthConsentAt: new Date(),
      healthConsentVersion: version,
    };
    this.users.set(id, updated);
    this.auditLogs.push({
      actorId: id,
      subjectId: id,
      actorRole: null,
      action: "consent_given",
      resource: "health_consent",
      createdAt: new Date(),
    });
    return updated;
  }

  async withdrawHealthConsent(id: string): Promise<AuthUser> {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User with id ${id} not found`);
    }
    const updated: AuthUser = {
      ...user,
      healthConsentAt: null,
      healthConsentVersion: null,
    };
    this.users.set(id, updated);
    this.auditLogs.push({
      actorId: id,
      subjectId: id,
      actorRole: null,
      action: "consent_withdrawn",
      resource: "health_consent",
      createdAt: new Date(),
    });
    return updated;
  }

  async purgeHealthData(id: string): Promise<void> {
    this.feedbacks = this.feedbacks.filter((f) => f.athleteId !== id);
    this.sessionLogs = this.sessionLogs.map((log) => {
      if (log.athleteId !== id) return log;
      const cleaned = stripCardiacMetrics(log.extra);
      return {
        ...log,
        rpe: null,
        extra: cleaned,
      };
    });
  }
}
