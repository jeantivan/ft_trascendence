-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'block';
ALTER TYPE "AuditAction" ADD VALUE 'unblock';
ALTER TYPE "AuditAction" ADD VALUE 'role_change';
ALTER TYPE "AuditAction" ADD VALUE 'delete';
ALTER TYPE "AuditAction" ADD VALUE 'create';
