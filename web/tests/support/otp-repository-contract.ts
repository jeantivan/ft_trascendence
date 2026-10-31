import { describe, expect, it } from "vitest";
import { OTP_MAX_ATTEMPTS, type OtpRepository } from "@/lib/gdpr/otp";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-31T12:00:00Z");
const IN_TEN_MINUTES = new Date(NOW.getTime() + 10 * 60 * 1000);

// Rules every OtpRepository must follow. Run it against each implementation
// (in memory today, Prisma later) so both behave the same.
export function runOtpRepositoryContract(name: string, createRepo: () => OtpRepository) {
  describe(`OtpRepository contract: ${name}`, () => {
    async function createCode(repo: OtpRepository) {
      return repo.create({
        userId: USER_ID,
        purpose: "delete_account",
        codeHash: "irrelevant-hash",
        expiresAt: IN_TEN_MINUTES,
        consumedAt: null,
      });
    }

    it("registerFailedAttempt cuenta cinco fallos y rechaza el sexto", async () => {
      const repo = createRepo();
      const { id } = await createCode(repo);

      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        expect(await repo.registerFailedAttempt(id, NOW)).toBe(true);
      }
      const sixth = await repo.registerFailedAttempt(id, NOW);
      const record = await repo.findLatest(USER_ID, "delete_account");

      expect(sixth).toBe(false);
      expect(record?.attempts).toBe(OTP_MAX_ATTEMPTS);
    });

    it("registerFailedAttempt no cuenta sobre un código consumido", async () => {
      const repo = createRepo();
      const { id } = await createCode(repo);
      expect(await repo.consumeIfUnused(id, NOW)).toBe(true);

      const counted = await repo.registerFailedAttempt(id, NOW);
      const record = await repo.findLatest(USER_ID, "delete_account");

      expect(counted).toBe(false);
      expect(record?.attempts).toBe(0);
      expect(record?.consumedAt?.getTime()).toBe(NOW.getTime());
    });

    it("consumeIfUnused rechaza un código bloqueado por intentos", async () => {
      const repo = createRepo();
      const { id } = await createCode(repo);
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        expect(await repo.registerFailedAttempt(id, NOW)).toBe(true);
      }

      const consumed = await repo.consumeIfUnused(id, NOW);
      const record = await repo.findLatest(USER_ID, "delete_account");

      expect(consumed).toBe(false);
      expect(record?.attempts).toBe(OTP_MAX_ATTEMPTS);
      expect(record?.consumedAt).toBeNull();
    });

    it("consumeIfUnused rechaza un código exactamente en expiresAt", async () => {
      const repo = createRepo();
      const { id } = await createCode(repo);

      const consumed = await repo.consumeIfUnused(id, IN_TEN_MINUTES);
      const record = await repo.findLatest(USER_ID, "delete_account");

      expect(consumed).toBe(false);
      expect(record).not.toBeNull();
      expect(record?.attempts).toBe(0);
      expect(record?.consumedAt).toBeNull();
    });

    it("registerFailedAttempt no cuenta exactamente en expiresAt", async () => {
      const repo = createRepo();
      const { id } = await createCode(repo);

      const counted = await repo.registerFailedAttempt(id, IN_TEN_MINUTES);
      const record = await repo.findLatest(USER_ID, "delete_account");

      expect(counted).toBe(false);
      expect(record?.attempts).toBe(0);
      expect(record?.consumedAt).toBeNull();
    });
  });
}
