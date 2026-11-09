CREATE TABLE formula_recycle_entries (
 "formulaId" UUID PRIMARY KEY, "ownerId" UUID NOT NULL,
 "deletedAt" TIMESTAMPTZ(3) NOT NULL, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "formula_recycle_entries_formulaId_ownerId_fkey" FOREIGN KEY ("formulaId","ownerId") REFERENCES formulas(id,"ownerId") ON DELETE CASCADE ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX "formula_recycle_entries_formulaId_ownerId_key" ON formula_recycle_entries("formulaId","ownerId");
CREATE INDEX "formula_recycle_entries_ownerId_deletedAt_idx" ON formula_recycle_entries("ownerId","deletedAt" DESC);
CREATE INDEX "formula_recycle_entries_expiresAt_formulaId_idx" ON formula_recycle_entries("expiresAt","formulaId");
-- Preserve deletion time and the original remaining restoration window.
INSERT INTO formula_recycle_entries ("formulaId","ownerId","deletedAt","expiresAt")
 SELECT id,"ownerId","deletedAt","deletedAt"+INTERVAL '10 days' FROM formulas
 WHERE "deletedAt" IS NOT NULL AND "canonicalId" IS NULL;
