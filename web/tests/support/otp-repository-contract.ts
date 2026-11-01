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
        createdAt: NOW,
        expiresAt: IN_TEN_MINUTES,
        consumedAt: null,
      });
    }

    it("reserveAttempt reserva cinco intentos y rechaza el sexto", async () => {
      const repo = createRepo();
      const { id } = await createCode(repo);

      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        expect(await repo.reserveAttempt(id, NOW)).toBe(true);
      }
      const sixth = await repo.reserveAttempt(id, NOW);
      const record = await repo.findLatest(USER_ID, "delete_account");

      expect(sixth).toBe(false);
      expect(record?.attempts).toBe(OTP_MAX_ATTEMPTS);
    });

    it("reserveAttempt no reserva sobre un código consumido", async () => {
      const repo = createRepo();
      const { id } = await createCode(repo);
      expect(await repo.consumeIfUnused(id, NOW)).toBe(true);

      const counted = await repo.reserveAttempt(id, NOW);
      const record = await repo.findLatest(USER_ID, "delete_account");

      expect(counted).toBe(false);
      expect(record?.attempts).toBe(0);
      expect(record?.consumedAt?.getTime()).toBe(NOW.getTime());
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

    it("reserveAttempt no reserva exactamente en expiresAt", async () => {
      const repo = createRepo();
      const { id } = await createCode(repo);

      const counted = await repo.reserveAttempt(id, IN_TEN_MINUTES);
      const record = await repo.findLatest(USER_ID, "delete_account");

      expect(counted).toBe(false);
      expect(record?.attempts).toBe(0);
      expect(record?.consumedAt).toBeNull();
    });

    it("reserveAttempt no reserva más de cinco intentos si llegan a la vez", async () => {
      const repo = createRepo();
      const { id } = await createCode(repo);

      const results = await Promise.all(
        Array.from({ length: 20 }, () => repo.reserveAttempt(id, NOW)),
      );
      const record = await repo.findLatest(USER_ID, "delete_account");

      expect(results.filter(Boolean)).toHaveLength(OTP_MAX_ATTEMPTS);
      expect(record?.attempts).toBe(OTP_MAX_ATTEMPTS);
    });

    it("findLatest devuelve el código con createdAt más reciente, no el último insertado", async () => {
      const repo = createRepo();
      const newer = await repo.create({
        userId: USER_ID,
        purpose: "delete_account",
        codeHash: "newer-hash",
        createdAt: NOW,
        expiresAt: IN_TEN_MINUTES,
        consumedAt: null,
      });
      await repo.create({
        userId: USER_ID,
        purpose: "delete_account",
        codeHash: "older-hash",
        createdAt: new Date(NOW.getTime() - 60 * 1000),
        expiresAt: IN_TEN_MINUTES,
        consumedAt: null,
      });

      const latest = await repo.findLatest(USER_ID, "delete_account");

      expect(latest?.id).toBe(newer.id);
    });

    it("findLatest desempata por id mayor cuando el createdAt es el mismo", async () => {
      const repo = createRepo();
      // ids are random, so use several codes: the tie must not depend on insertion order
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        const { id } = await createCode(repo);
        ids.push(id);
      }

      const latest = await repo.findLatest(USER_ID, "delete_account");

      expect(latest?.id).toBe([...ids].sort().at(-1));
    });
  });
}
