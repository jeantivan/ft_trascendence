/*
  Warnings:

  - Added the required column `purpose` to the `email_otp_codes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('delete_account', 'export_data');

-- AlterTable
ALTER TABLE "email_otp_codes" ADD COLUMN     "purpose" "OtpPurpose" NOT NULL;
