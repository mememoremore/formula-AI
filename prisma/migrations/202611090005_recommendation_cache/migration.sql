CREATE TABLE "recommendation_caches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerId" UUID NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "status" VARCHAR(12) NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]',
  "error" VARCHAR(500),
  "token" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "recommendation_caches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recommendation_caches_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "recommendation_caches_ownerId_fingerprint_key" ON "recommendation_caches"("ownerId", "fingerprint");
CREATE INDEX "recommendation_caches_ownerId_status_expiresAt_idx" ON "recommendation_caches"("ownerId", "status", "expiresAt");
