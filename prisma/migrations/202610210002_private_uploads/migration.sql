-- AlterTable
ALTER TABLE "stored_files" ADD COLUMN     "contentHash" CHAR(64),
ADD COLUMN     "uploadKey" VARCHAR(100);

-- CreateIndex
CREATE INDEX "formulas_ownerId_createdAt_id_idx" ON "formulas"("ownerId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_ownerId_uploadKey_key" ON "stored_files"("ownerId", "uploadKey");

-- 旧样例可同时留空；正式上传的请求键与内容哈希必须成对存在。
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_upload_identity_check" CHECK (
  ("uploadKey" IS NULL AND "contentHash" IS NULL)
  OR ("uploadKey" IS NOT NULL AND length(btrim("uploadKey")) > 0
      AND "contentHash" IS NOT NULL AND "contentHash" ~ '^[0-9a-f]{64}$')
);
