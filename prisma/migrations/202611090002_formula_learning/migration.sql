CREATE TABLE "formula_learning" (
 "formulaId" UUID PRIMARY KEY, "ownerId" UUID NOT NULL,
 "notes" VARCHAR(6000) NOT NULL DEFAULT '', "conditions" VARCHAR(2000) NOT NULL DEFAULT '', "question" VARCHAR(600) NOT NULL DEFAULT '',
 "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "revision" INTEGER NOT NULL DEFAULT 0,
 "reviewEnabled" BOOLEAN NOT NULL DEFAULT false, "nextReviewAt" TIMESTAMPTZ(3), "intervalDays" INTEGER NOT NULL DEFAULT 0,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "formula_learning_formulaId_ownerId_fkey" FOREIGN KEY ("formulaId","ownerId") REFERENCES "formulas"("id","ownerId") ON DELETE CASCADE ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX "formula_learning_ownerId_reviewEnabled_nextReviewAt_idx" ON "formula_learning"("ownerId","reviewEnabled","nextReviewAt");
CREATE UNIQUE INDEX "formula_learning_formulaId_ownerId_key" ON "formula_learning"("formulaId","ownerId");
