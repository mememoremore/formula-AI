-- AlterTable
ALTER TABLE "formulas" ADD COLUMN     "canonicalId" UUID,
ADD COLUMN     "duplicateCheck" JSONB,
ADD COLUMN     "duplicateDecision" VARCHAR(8);

-- CreateTable
CREATE TABLE "formula_repairs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "formulaId" UUID NOT NULL,
    "expectedVersionId" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "domain" VARCHAR(60) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "originalLatex" TEXT NOT NULL,
    "candidateLatex" TEXT,
    "reason" VARCHAR(1000),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formula_repairs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "formula_repairs_formulaId_ownerId_idx" ON "formula_repairs"("formulaId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "formula_repairs_ownerId_requestKey_key" ON "formula_repairs"("ownerId", "requestKey");

-- CreateIndex
CREATE INDEX "formulas_canonicalId_ownerId_idx" ON "formulas"("canonicalId", "ownerId");

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_canonicalId_ownerId_fkey" FOREIGN KEY ("canonicalId", "ownerId") REFERENCES "formulas"("id", "ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formula_repairs" ADD CONSTRAINT "formula_repairs_formulaId_ownerId_fkey" FOREIGN KEY ("formulaId", "ownerId") REFERENCES "formulas"("id", "ownerId") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "formulas" ALTER CONSTRAINT "formulas_canonicalId_ownerId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "formulas" ADD CONSTRAINT formulas_identity_not_self CHECK ("canonicalId" IS NULL OR "canonicalId" <> id);
ALTER TABLE "formulas" ADD CONSTRAINT formulas_duplicate_decision CHECK ("duplicateDecision" IS NULL OR "duplicateDecision" IN ('agree','ignore'));
ALTER TABLE formula_repairs ADD CONSTRAINT formula_repairs_status CHECK (status IN ('PROCESSING','CANDIDATE','UNCHANGED','UNCERTAIN','FAILED','CONFIRMED'));
