import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "@/lib/auth/password";
import { issueOtp, OTP_MAX_ATTEMPTS, verifyOtp } from "@/lib/gdpr/otp";
import { InMemoryOtpRepository } from "../support/in-memory-otp-repository";

// Same behaviour as the real module, but now we can count the hash checks
vi.mock("@/lib/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/password")>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("verifyOtp", () => {
  let repo: InMemoryOtpRepository;

  beforeEach(() => {
    repo = new InMemoryOtpRepository();
    vi.mocked(verifyPassword).mockClear();
  });

  it("acepta un código con el propósito correcto", async () => {
    const code = await issueOtp(USER_ID, "delete_account", repo);

    const result = await verifyOtp(USER_ID, "delete_account", code, repo);

    expect(result).toEqual({ success: true });
  });

  it("rechaza un código emitido para otro propósito", async () => {
    const code = await issueOtp(USER_ID, "export_data", repo);

    const result = await verifyOtp(USER_ID, "delete_account", code, repo);
    const record = await repo.findLatest(USER_ID, "export_data");

    expect(result).toEqual({ success: false, reason: "invalid" });
    expect(record?.attempts).toBe(0);
    expect(record?.consumedAt).toBeNull();
  });

  it("rechaza un código pasados 10 minutos", async () => {
    const issuedAt = new Date("2026-10-30T12:00:00Z");
    const code = await issueOtp(USER_ID, "delete_account", repo, issuedAt);

    const tenMinutesAndOneSecond = new Date(issuedAt.getTime() + 10 * 60 * 1000 + 1000);
    const result = await verifyOtp(USER_ID, "delete_account", code, repo, tenMinutesAndOneSecond);
    const record = await repo.findLatest(USER_ID, "delete_account");

    expect(result).toEqual({ success: false, reason: "invalid" });
    expect(record?.attempts).toBe(0);
    expect(record?.consumedAt).toBeNull();
  });

  it("rechaza un código ya usado", async () => {
    const code = await issueOtp(USER_ID, "delete_account", repo);

    const first = await verifyOtp(USER_ID, "delete_account", code, repo);
    const afterFirst = await repo.findLatest(USER_ID, "delete_account");
    const firstConsumedAt = afterFirst?.consumedAt?.getTime();
    const second = await verifyOtp(USER_ID, "delete_account", code, repo);
    const afterSecond = await repo.findLatest(USER_ID, "delete_account");

    expect(first).toEqual({ success: true });
    expect(firstConsumedAt).toBeDefined();
    expect(second).toEqual({ success: false, reason: "invalid" });
    expect(afterSecond?.consumedAt?.getTime()).toBe(firstConsumedAt);
    expect(afterSecond?.attempts).toBe(1);
  });

  it("rechaza un código válido si el repositorio no consigue consumirlo", async () => {
    // Simula la carrera: otra petición consumió el código entre la lectura y el consumo
    class LostRaceRepository extends InMemoryOtpRepository {
      async consumeIfUnused(): Promise<boolean> {
        return false;
      }
    }
    const racedRepo = new LostRaceRepository();
    const code = await issueOtp(USER_ID, "delete_account", racedRepo);

    const result = await verifyOtp(USER_ID, "delete_account", code, racedRepo);
    const record = await racedRepo.findLatest(USER_ID, "delete_account");

    expect(result).toEqual({ success: false, reason: "invalid" });
    expect(record?.attempts).toBe(1);
    expect(record?.consumedAt).toBeNull();
  });

  it("rechaza el código correcto tras cinco intentos fallidos", async () => {
    const code = await issueOtp(USER_ID, "delete_account", repo);
    const wrongCode = code === "000000" ? "000001" : "000000";

    for (let i = 0; i < 5; i++) {
      const result = await verifyOtp(USER_ID, "delete_account", wrongCode, repo);
      expect(result).toEqual({ success: false, reason: "invalid" });
    }
    const result = await verifyOtp(USER_ID, "delete_account", code, repo);
    const record = await repo.findLatest(USER_ID, "delete_account");

    expect(result).toEqual({ success: false, reason: "invalid" });
    expect(record?.attempts).toBe(5);
    expect(record?.consumedAt).toBeNull();
  });

  it("acepta el código correcto tras cuatro intentos fallidos", async () => {
    const code = await issueOtp(USER_ID, "delete_account", repo);
    const wrongCode = code === "000000" ? "000001" : "000000";

    for (let i = 0; i < 4; i++) {
      await verifyOtp(USER_ID, "delete_account", wrongCode, repo);
    }
    const result = await verifyOtp(USER_ID, "delete_account", code, repo);

    expect(result).toEqual({ success: true });
  });

  it("no sigue sumando intentos una vez bloqueado el código", async () => {
    const code = await issueOtp(USER_ID, "delete_account", repo);
    const wrongCode = code === "000000" ? "000001" : "000000";

    for (let i = 0; i < 7; i++) {
      const result = await verifyOtp(USER_ID, "delete_account", wrongCode, repo);
      expect(result).toEqual({ success: false, reason: "invalid" });
    }
    const record = await repo.findLatest(USER_ID, "delete_account");

    expect(record).not.toBeNull();
    expect(record?.attempts).toBe(5);
  });

  it("no cuenta intentos fallidos sobre un código expirado", async () => {
    const issuedAt = new Date("2026-10-30T12:00:00Z");
    const code = await issueOtp(USER_ID, "delete_account", repo, issuedAt);
    const wrongCode = code === "000000" ? "000001" : "000000";

    const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);
    const result = await verifyOtp(USER_ID, "delete_account", wrongCode, repo, expiresAt);
    const record = await repo.findLatest(USER_ID, "delete_account");

    expect(result).toEqual({ success: false, reason: "invalid" });
    expect(record?.attempts).toBe(0);
    expect(record?.consumedAt).toBeNull();
  });

  it("no cuenta intentos fallidos sobre un código ya consumido", async () => {
    const code = await issueOtp(USER_ID, "delete_account", repo);
    const wrongCode = code === "000000" ? "000001" : "000000";

    await verifyOtp(USER_ID, "delete_account", code, repo);
    const afterConsume = await repo.findLatest(USER_ID, "delete_account");
    const consumedAt = afterConsume?.consumedAt?.getTime();
    const result = await verifyOtp(USER_ID, "delete_account", wrongCode, repo);
    const record = await repo.findLatest(USER_ID, "delete_account");

    expect(result).toEqual({ success: false, reason: "invalid" });
    expect(consumedAt).toBeDefined();
    expect(record?.consumedAt?.getTime()).toBe(consumedAt);
    expect(record?.attempts).toBe(1);
  });

  it("acepta un código un milisegundo antes de expirar", async () => {
    const issuedAt = new Date("2026-10-30T12:00:00Z");
    const code = await issueOtp(USER_ID, "delete_account", repo, issuedAt);

    const justBefore = new Date(issuedAt.getTime() + 10 * 60 * 1000 - 1);
    const result = await verifyOtp(USER_ID, "delete_account", code, repo, justBefore);

    expect(result).toEqual({ success: true });
  });

  it("rechaza un código exactamente en el instante de expirar", async () => {
    const issuedAt = new Date("2026-10-30T12:00:00Z");
    const code = await issueOtp(USER_ID, "delete_account", repo, issuedAt);

    const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);
    const result = await verifyOtp(USER_ID, "delete_account", code, repo, expiresAt);
    const record = await repo.findLatest(USER_ID, "delete_account");

    expect(result).toEqual({ success: false, reason: "invalid" });
    expect(record?.attempts).toBe(0);
    expect(record?.consumedAt).toBeNull();
  });

  it("no comprueba más de cinco intentos aunque lleguen a la vez", async () => {
    const code = await issueOtp(USER_ID, "delete_account", repo);
    const wrongCode = code === "000000" ? "000001" : "000000";
    const { codeHash } = (await repo.findLatest(USER_ID, "delete_account"))!;

    // All 20 start before any of them has finished its hash check
    await Promise.all(
      Array.from({ length: 20 }, () => verifyOtp(USER_ID, "delete_account", wrongCode, repo)),
    );

    // Rejected requests also hash (against a dummy hash), so count only the real one
    const realChecks = vi.mocked(verifyPassword).mock.calls.filter(([, hash]) => hash === codeHash);
    expect(realChecks).toHaveLength(OTP_MAX_ATTEMPTS);
  });

  describe("coste uniforme de los rechazos", () => {
    // Every rejection must pay for one hash check, so the response time does not
    // tell whether a usable code exists
    async function hashChecksDuring(action: () => Promise<unknown>): Promise<number> {
      vi.mocked(verifyPassword).mockClear();
      await action();
      return vi.mocked(verifyPassword).mock.calls.length;
    }

    it("cuando el usuario no tiene código", async () => {
      const checks = await hashChecksDuring(() => verifyOtp(USER_ID, "delete_account", "123456", repo));

      expect(checks).toBe(1);
    });

    it("cuando el código ha caducado", async () => {
      const issuedAt = new Date("2026-10-30T12:00:00Z");
      const code = await issueOtp(USER_ID, "delete_account", repo, issuedAt);
      const expiredAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);

      const checks = await hashChecksDuring(() => verifyOtp(USER_ID, "delete_account", code, repo, expiredAt));

      expect(checks).toBe(1);
    });

    it("cuando el código ya se usó", async () => {
      const code = await issueOtp(USER_ID, "delete_account", repo);
      await verifyOtp(USER_ID, "delete_account", code, repo);

      const checks = await hashChecksDuring(() => verifyOtp(USER_ID, "delete_account", code, repo));

      expect(checks).toBe(1);
    });

    it("cuando el código está bloqueado por intentos", async () => {
      const code = await issueOtp(USER_ID, "delete_account", repo);
      const wrongCode = code === "000000" ? "000001" : "000000";
      for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
        await verifyOtp(USER_ID, "delete_account", wrongCode, repo);
      }

      const checks = await hashChecksDuring(() => verifyOtp(USER_ID, "delete_account", code, repo));

      expect(checks).toBe(1);
    });
  });
});
