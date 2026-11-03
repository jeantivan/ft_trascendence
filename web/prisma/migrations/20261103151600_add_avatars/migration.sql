-- CreateTable
CREATE TABLE "avatars" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avatars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avatars_owner_id_idx" ON "avatars"("owner_id");

-- AddForeignKey
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
