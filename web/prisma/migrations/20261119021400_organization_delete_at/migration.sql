-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "delete_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "organizations_delete_at_idx" ON "organizations"("delete_at");
