-- AlterTable
ALTER TABLE "users" DROP COLUMN "name",
ADD COLUMN     "health_consent_version" INTEGER;
