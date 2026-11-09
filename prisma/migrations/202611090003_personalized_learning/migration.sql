ALTER TABLE users ADD COLUMN "grade" VARCHAR(80), ADD COLUMN "learningPurpose" VARCHAR(300);
ALTER TABLE formula_learning
 ADD COLUMN questions JSONB NOT NULL DEFAULT '[]',
 ADD COLUMN "questionsInitialized" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "conditionsCustomized" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN mastery VARCHAR(12) NOT NULL DEFAULT 'UNFAMILIAR',
 ADD COLUMN "masteryNotes" VARCHAR(2000) NOT NULL DEFAULT '';
UPDATE formula_learning SET "conditionsCustomized"=true WHERE conditions<>'';
UPDATE formula_learning SET questions=jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'question',question,'answer','','source','manual')) WHERE question<>'';
CREATE TABLE learning_question_generations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "ownerId" UUID NOT NULL, "formulaId" UUID NOT NULL,
 "versionId" UUID NOT NULL, "profileHash" CHAR(64) NOT NULL, status VARCHAR(12) NOT NULL,
 questions JSONB NOT NULL DEFAULT '[]', error VARCHAR(300), token UUID NOT NULL,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "learning_question_generations_formulaId_ownerId_fkey" FOREIGN KEY ("formulaId","ownerId") REFERENCES formulas(id,"ownerId") ON DELETE CASCADE ON UPDATE RESTRICT DEFERRABLE INITIALLY DEFERRED
);
CREATE UNIQUE INDEX "learning_question_generations_context_key" ON learning_question_generations("ownerId","formulaId","versionId","profileHash");
CREATE INDEX "learning_question_generations_ownerId_status_expiresAt_idx" ON learning_question_generations("ownerId",status,"expiresAt");
