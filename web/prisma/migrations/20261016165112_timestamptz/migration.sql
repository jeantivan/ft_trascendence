-- AlterTable
ALTER TABLE "audit_log" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "contacts" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "conversation_participants" ALTER COLUMN "removed_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "conversations" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "email_otp_codes" ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "consumed_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "events" ALTER COLUMN "starts_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "cancelled_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "feedback" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "membership_requests" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "memberships" ALTER COLUMN "joined_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "read_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "recovery_codes" ALTER COLUMN "used_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "session_logs" ALTER COLUMN "performed_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "scheduled_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "spot_requests" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "blocked_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "health_consent_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);
