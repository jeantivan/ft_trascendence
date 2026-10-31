-- CreateEnum
CREATE TYPE "ActorRole" AS ENUM ('admin', 'manager');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'consent_given';
ALTER TYPE "AuditAction" ADD VALUE 'consent_withdrawn';

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "actor_role" "ActorRole";

-- AddCheckConstraint (hand-written: Prisma does not model CHECK constraints)
-- health_consent_at and health_consent_version are both null or both set
-- (PR #31). Postgres checks the existing rows first: if one has only one of
-- them, this statement fails instead of making up a consent version.
ALTER TABLE "users" ADD CONSTRAINT "users_health_consent_both_or_neither"
  CHECK (("health_consent_at" IS NULL) = ("health_consent_version" IS NULL));
