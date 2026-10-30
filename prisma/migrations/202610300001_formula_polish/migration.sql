ALTER TABLE "recognition_tasks"
ADD COLUMN "requestedTitle" VARCHAR(100);

ALTER TABLE "formulas"
ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

CREATE INDEX "formulas_ownerId_deletedAt_createdAt_id_idx"
ON "formulas"("ownerId", "deletedAt", "createdAt" DESC, "id" DESC);
