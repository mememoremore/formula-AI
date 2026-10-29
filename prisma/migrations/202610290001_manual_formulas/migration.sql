BEGIN;
ALTER TABLE "formulas" ADD COLUMN "creationKey" VARCHAR(100), ADD COLUMN "creationHash" CHAR(64);
CREATE UNIQUE INDEX "formulas_ownerId_creationKey_key" ON "formulas"("ownerId", "creationKey");
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_creation_identity" CHECK (
  ("creationKey" IS NULL AND "creationHash" IS NULL) OR
  ("creationKey" IS NOT NULL AND "creationHash" IS NOT NULL AND
   "creationKey" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND
   "creationHash" ~ '^[0-9a-f]{64}$' AND "recognitionTaskId" IS NULL)
);
ALTER TABLE "formula_versions" DROP CONSTRAINT "formula_versions_origin_order";
ALTER TABLE "formula_versions" ADD CONSTRAINT "formula_versions_origin_order" CHECK (
  ("number" = 1 AND "origin" IN ('RECOGNITION','DEMO','MANUAL')) OR ("number" > 1 AND "origin" = 'MANUAL')
);
COMMIT;
