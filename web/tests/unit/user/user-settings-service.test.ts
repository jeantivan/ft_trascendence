import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryUserRepository } from "../../support/in-memory-user-repository";
import {
  EmailChangeNotAllowedForOAuthError,
  InvalidCurrentPasswordError,
  MissingCurrentPasswordError,
  UserNotFoundError,
  UserSettingsService,
} from "@/lib/user/user-settings-service";
import { UserAlreadyExistsError } from "@/lib/auth/user-repository";
import { hashPassword } from "@/lib/auth/password";

describe("UserSettingsService", () => {
  let repo: InMemoryUserRepository;
  let service: UserSettingsService;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    service = new UserSettingsService(repo);
  });

  describe("getProfile", () => {
    it("returns profile with hasPassword: true when passwordHash is present", async () => {
      const user = await repo.createUser({
        email: "runner@42.com",
        passwordHash: "hash123",
        nick: "runner42",
      });

      const profile = await service.getProfile(user.id);

      expect(profile).toEqual({
        id: user.id,
        email: "runner@42.com",
        nick: "runner42",
        image: null,
        hasPassword: true,
        statsPublic: false,
        showOnline: true,
        notificationsEnabled: true,
        healthConsentAt: null,
        healthConsentVersion: null,
      });
      expect(profile).not.toHaveProperty("passwordHash");
    });

    it("returns profile with hasPassword: false for solo-OAuth accounts", async () => {
      const user = await repo.createUser({
        email: "oauth@42.com",
        passwordHash: null,
        nick: "oauthuser",
      });

      const profile = await service.getProfile(user.id);

      expect(profile.hasPassword).toBe(false);
      expect(profile.email).toBe("oauth@42.com");
    });

    it("throws UserNotFoundError when user does not exist", async () => {
      await expect(service.getProfile("non-existent-id")).rejects.toThrow(
        UserNotFoundError
      );
    });

    it("throws UserNotFoundError when user is blocked", async () => {
      const user = await repo.createUser({
        email: "blocked@42.com",
        passwordHash: "hash123",
        nick: "blockeduser",
      });
      // Set blockedAt
      const inMemoryUser = await repo.findById(user.id);
      if (inMemoryUser) inMemoryUser.blockedAt = new Date();

      await expect(service.getProfile(user.id)).rejects.toThrow(
        UserNotFoundError
      );
    });
  });

  describe("updateNick", () => {
    it("updates nick when input is valid", async () => {
      const user = await repo.createUser({
        email: "runner@42.com",
        passwordHash: "hash123",
        nick: "initialNick",
      });

      const updated = await service.updateNick(user.id, { nick: "  newNick  " });

      expect(updated.nick).toBe("newNick");
      const found = await repo.findById(user.id);
      expect(found?.nick).toBe("newNick");
    });

    it("rejects nick shorter than 2 characters", async () => {
      const user = await repo.createUser({
        email: "runner@42.com",
        passwordHash: "hash123",
        nick: "runner42",
      });

      await expect(service.updateNick(user.id, { nick: "a" })).rejects.toThrow();
    });
  });

  describe("updateEmail", () => {
    it("rejects email change for solo-OAuth accounts with EmailChangeNotAllowedForOAuthError", async () => {
      const user = await repo.createUser({
        email: "oauth@42.com",
        passwordHash: null,
        nick: "oauthuser",
      });

      await expect(
        service.updateEmail(user.id, {
          email: "new-oauth@42.com",
        })
      ).rejects.toThrow(EmailChangeNotAllowedForOAuthError);
    });

    it("updates email for password accounts when current password matches", async () => {
      const password = "passwordSegura123";
      const hash = await hashPassword(password);
      const user = await repo.createUser({
        email: "runner@42.com",
        passwordHash: hash,
        nick: "runner",
      });

      const updated = await service.updateEmail(user.id, {
        email: "newemail@42.com",
        currentPassword: password,
      });

      expect(updated.email).toBe("newemail@42.com");
    });

    it("throws MissingCurrentPasswordError when current password is missing for password accounts", async () => {
      const hash = await hashPassword("pass12345");
      const user = await repo.createUser({
        email: "runner@42.com",
        passwordHash: hash,
        nick: "runner",
      });

      await expect(
        service.updateEmail(user.id, { email: "newemail@42.com" })
      ).rejects.toThrow(MissingCurrentPasswordError);
    });

    it("throws InvalidCurrentPasswordError when current password is wrong", async () => {
      const hash = await hashPassword("pass12345");
      const user = await repo.createUser({
        email: "runner@42.com",
        passwordHash: hash,
        nick: "runner",
      });

      await expect(
        service.updateEmail(user.id, {
          email: "newemail@42.com",
          currentPassword: "passwordIncorrecta",
        })
      ).rejects.toThrow(InvalidCurrentPasswordError);
    });

    it("throws UserAlreadyExistsError when email belongs to another user", async () => {
      await repo.createUser({
        email: "existing@42.com",
        passwordHash: "hash1",
        nick: "user1",
      });
      const password = "validPassword123";
      const hash = await hashPassword(password);
      const user2 = await repo.createUser({
        email: "user2@42.com",
        passwordHash: hash,
        nick: "user2",
      });

      await expect(
        service.updateEmail(user2.id, {
          email: "existing@42.com",
          currentPassword: password,
        })
      ).rejects.toThrow(UserAlreadyExistsError);
    });
  });

  describe("updatePassword", () => {
    it("sets first password for solo-OAuth accounts without current password", async () => {
      const user = await repo.createUser({
        email: "oauth@42.com",
        passwordHash: null,
        nick: "oauthuser",
      });

      await service.updatePassword(user.id, {
        newPassword: "nuevaPasswordSegura123",
      });

      const found = await repo.findById(user.id);
      expect(found?.passwordHash).not.toBeNull();
      expect(found?.passwordHash).not.toBe("nuevaPasswordSegura123"); // must be hashed
    });

    it("updates password when current password matches", async () => {
      const currentPassword = "antiguaPassword123";
      const hash = await hashPassword(currentPassword);
      const user = await repo.createUser({
        email: "runner@42.com",
        passwordHash: hash,
        nick: "runner",
      });

      await service.updatePassword(user.id, {
        currentPassword,
        newPassword: "nuevaPassword123",
      });

      const found = await repo.findById(user.id);
      expect(found?.passwordHash).not.toBe(hash);
    });

    it("throws InvalidCurrentPasswordError when current password is wrong", async () => {
      const hash = await hashPassword("originalPass123");
      const user = await repo.createUser({
        email: "runner@42.com",
        passwordHash: hash,
        nick: "runner",
      });

      await expect(
        service.updatePassword(user.id, {
          currentPassword: "wrongPassword123",
          newPassword: "nuevaPassword123",
        })
      ).rejects.toThrow(InvalidCurrentPasswordError);
    });

    it("rejects new password shorter than 8 characters", async () => {
      const user = await repo.createUser({
        email: "oauth@42.com",
        passwordHash: null,
        nick: "oauthuser",
      });

      await expect(
        service.updatePassword(user.id, {
          newPassword: "short",
        })
      ).rejects.toThrow();
    });
  });
});
