BEGIN;
ALTER TYPE "FileKind" ADD VALUE 'AVATAR';
ALTER TYPE "FileStatus" ADD VALUE 'DELETING';
CREATE TYPE "ResourcePurpose" AS ENUM ('IMAGE_UPLOAD', 'AVATAR_UPLOAD', 'DOCX_WRITE');
CREATE TYPE "ResourceLeaseStatus" AS ENUM ('ACTIVE', 'REVIEW_REQUIRED', 'RELEASED');
CREATE TABLE "resource_leases" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "ownerId" UUID NOT NULL,
 "purpose" "ResourcePurpose" NOT NULL, "requestKey" VARCHAR(100) NOT NULL,
 "executionToken" UUID NOT NULL UNIQUE, "status" "ResourceLeaseStatus" NOT NULL DEFAULT 'ACTIVE',
 "reservedBytes" BIGINT NOT NULL DEFAULT 0, "countsTowardRate" BOOLEAN NOT NULL DEFAULT true,
 "fileId" UUID, "expiresAt" TIMESTAMPTZ(3) NOT NULL, "finishedAt" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "resource_leases_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "resource_leases_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT,
 CONSTRAINT "resource_lease_bytes" CHECK ("reservedBytes" >= 0 AND ("fileId" IS NULL OR "reservedBytes" = 0)),
 CONSTRAINT "resource_lease_finished" CHECK (("status" = 'RELEASED') = ("finishedAt" IS NOT NULL)),
 CONSTRAINT "resource_lease_released_bytes" CHECK ("status" <> 'RELEASED' OR "reservedBytes" = 0)
);
CREATE UNIQUE INDEX "resource_leases_active_request" ON "resource_leases" ("ownerId", "purpose", "requestKey") WHERE "status" IN ('ACTIVE', 'REVIEW_REQUIRED');
CREATE INDEX "resource_leases_ownerId_purpose_createdAt_idx" ON "resource_leases" ("ownerId", "purpose", "createdAt");
CREATE INDEX "resource_leases_status_expiresAt_idx" ON "resource_leases" ("status", "expiresAt");
CREATE INDEX "resource_leases_fileId_idx" ON "resource_leases" ("fileId");
CREATE INDEX "stored_files_status_updatedAt_idx" ON "stored_files" ("status", "updatedAt");
CREATE TABLE "storage_cleanup_audits" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "operationId" UUID NOT NULL, "fileId" UUID,
 "objectFingerprint" CHAR(64) NOT NULL, "action" VARCHAR(40) NOT NULL, "outcome" VARCHAR(40) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "storage_cleanup_audits_fileId_createdAt_idx" ON "storage_cleanup_audits" ("fileId", "createdAt");
CREATE INDEX "storage_cleanup_audits_operationId_idx" ON "storage_cleanup_audits" ("operationId");

COMMIT;
