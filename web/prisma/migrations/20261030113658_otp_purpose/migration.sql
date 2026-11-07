/*
  Warnings:

  - Added the required column `purpose` to the `email_otp_codes` table without a default value. Not possible if the table is not empty, so the existing rows are deleted first (see below).

*/
-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('delete_account', 'export_data');

-- Existing codes have no purpose and cannot be assigned one safely (a code issued
-- for export must not authorize a deletion). They live 10 minutes, so deleting
-- them only forces users to request a new code.
DELETE FROM "email_otp_codes";

-- AlterTable
ALTER TABLE "email_otp_codes" ADD COLUMN     "purpose" "OtpPurpose" NOT NULL;
