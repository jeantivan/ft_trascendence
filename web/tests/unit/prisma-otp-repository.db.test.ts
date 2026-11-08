// @vitest-environment node
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaOtpRepository } from "@/lib/gdpr/prisma-otp-repository";
import { OTHER_USER_ID, runOtpRepositoryContract, USER_ID } from "../support/otp-repository-contract";

// These tests delete rows. vitest.config.mts only runs them against a database ending in _test
const url = process.env.DATABASE_URL_TEST;

describe("PrismaOtpRepository", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  beforeAll(async () => {
    for (const [id, email] of [
      [USER_ID, "otp-contract-1@example.test"],
      [OTHER_USER_ID, "otp-contract-2@example.test"],
    ]) {
      await db.user.upsert({ where: { id }, update: {}, create: { id, email } });
    }
  });

  // Only this file's users: other test files share the database and run in parallel
  const contractUsers = { userId: { in: [USER_ID, OTHER_USER_ID] } };

  // Each test starts without codes (the users stay)
  beforeEach(async () => {
    await db.emailOtpCode.deleteMany({ where: contractUsers });
  });

  afterAll(async () => {
    await db.emailOtpCode.deleteMany({ where: contractUsers });
    await db.user.deleteMany({ where: { id: { in: [USER_ID, OTHER_USER_ID] } } });
    await db.$disconnect();
  });

  runOtpRepositoryContract("prisma", () => new PrismaOtpRepository(db));
});
