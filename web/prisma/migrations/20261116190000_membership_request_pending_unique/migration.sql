/*
  Warnings:

  - A unique constraint covering (org_id, user_id) where status = 'pending' will be added. If a user already has two pending rows in the same club, this will fail.

  Known limit: nothing creates duplicate pending rows before this migration, so it only fails on
  data inserted by hand.

  Partial index: Prisma's schema cannot express it, so it lives only here. Do not let
  `migrate dev` drop it when it reports drift.
*/
-- CreateIndex
CREATE UNIQUE INDEX "membership_requests_org_user_pending_key" ON "membership_requests"("org_id", "user_id") WHERE "status" = 'pending';
