import type { PrismaClient } from "@/generated/prisma/client";
import { deleteAccountWithOtp } from "@/lib/gdpr/delete-account";
import { issueOtp } from "@/lib/gdpr/otp";
import { PrismaOtpRepository } from "@/lib/gdpr/prisma-otp-repository";

// Issues a real delete_account code for the user (only its hash is stored)
export async function issueDeleteCode(db: PrismaClient, userId: string): Promise<string> {
  const result = await issueOtp(userId, "delete_account", new PrismaOtpRepository(db));
  if (!result.issued) throw new Error("test setup: the OTP cooldown has not passed");
  return result.code;
}

// Issues a code with db and deletes through callDb, so a test can swap in a client that fails
// uploadsDir is where the avatar files are looked for (a temp dir in tests)
export async function deleteWithFreshOtp(
  userId: string,
  db: PrismaClient,
  callDb: PrismaClient = db,
  uploadsDir?: string,
) {
  const code = await issueDeleteCode(db, userId);
  return deleteAccountWithOtp(userId, code, callDb, uploadsDir);
}
