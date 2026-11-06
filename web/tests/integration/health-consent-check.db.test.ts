// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

// The CHECK is written by hand in a migration and Prisma does not know about it,
// so only a real Postgres can enforce it.
const CONSTRAINT = "users_health_consent_both_or_neither";
const EMAIL_PREFIX = "health-consent-check-";

function createUser(
  name: string,
  consent: { healthConsentAt?: Date; healthConsentVersion?: number },
) {
  return prisma.user.create({
    data: { email: `${EMAIL_PREFIX}${name}@example.com`, ...consent },
  });
}

describe("Integration: health consent CHECK", () => {
  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects a consent date without a version", async () => {
    await expect(createUser("only-date", { healthConsentAt: new Date() })).rejects.toThrow(CONSTRAINT);
  });

  it("rejects a consent version without a date", async () => {
    await expect(createUser("only-version", { healthConsentVersion: 1 })).rejects.toThrow(CONSTRAINT);
  });

  it("accepts neither the date nor the version", async () => {
    const user = await createUser("neither", {});
    expect(user.healthConsentAt).toBeNull();
    expect(user.healthConsentVersion).toBeNull();
  });

  it("accepts both the date and the version", async () => {
    const date = new Date();
    const user = await createUser("both", { healthConsentAt: date, healthConsentVersion: 1 });
    expect(user.healthConsentAt).toEqual(date);
    expect(user.healthConsentVersion).toBe(1);
  });
});
