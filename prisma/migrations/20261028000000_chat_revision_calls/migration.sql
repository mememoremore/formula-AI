BEGIN;
-- CreateEnum
CREATE TYPE "ChatCallStatus" AS ENUM ('PREPARED', 'IN_FLIGHT', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ChatUsageSource" AS ENUM ('UNKNOWN', 'PROVIDER_REPORTED', 'MOCK');

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "revision" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "chat_call_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "turnId" UUID NOT NULL,
    "workerAttempt" INTEGER NOT NULL,
    "callIndex" INTEGER NOT NULL DEFAULT 1,
    "queueJobId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "isMock" BOOLEAN NOT NULL,
    "status" "ChatCallStatus" NOT NULL DEFAULT 'PREPARED',
    "preparedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchIntentAt" TIMESTAMPTZ(3),
    "transportInvokedAt" TIMESTAMPTZ(3),
    "responseObservedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "durationMs" INTEGER,
    "providerRequestId" VARCHAR(200),
    "httpStatus" INTEGER,
    "finishReason" VARCHAR(32),
    "errorCode" VARCHAR(64),
    "usageSource" "ChatUsageSource" NOT NULL DEFAULT 'UNKNOWN',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "resultCommittedAt" TIMESTAMPTZ(3),
    "resultDiscardedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_call_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_call_attempts_ownerId_createdAt_id_idx" ON "chat_call_attempts"("ownerId", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "chat_call_attempts_status_updatedAt_id_idx" ON "chat_call_attempts"("status", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_call_attempts_turnId_workerAttempt_callIndex_key" ON "chat_call_attempts"("turnId", "workerAttempt", "callIndex");

-- AddForeignKey
ALTER TABLE "chat_call_attempts" ADD CONSTRAINT "chat_call_attempts_turnId_ownerId_fkey" FOREIGN KEY ("turnId", "ownerId") REFERENCES "chat_turns"("id", "ownerId") ON DELETE CASCADE ON UPDATE RESTRICT;


ALTER TABLE conversations ADD CONSTRAINT conversation_revision_nonnegative CHECK (revision >= 0);
ALTER TABLE chat_call_attempts ADD CONSTRAINT chat_call_counts CHECK (
 "workerAttempt">0 AND "callIndex">0 AND ("durationMs" IS NULL OR "durationMs">=0)
 AND ("inputTokens" IS NULL OR "inputTokens">=0) AND ("outputTokens" IS NULL OR "outputTokens">=0)
 AND ("totalTokens" IS NULL OR "totalTokens">=0) AND ("httpStatus" IS NULL OR "httpStatus" BETWEEN 100 AND 599)
 AND NOT ("resultCommittedAt" IS NOT NULL AND "resultDiscardedAt" IS NOT NULL)
 AND (("usageSource" IN ('UNKNOWN','MOCK') AND "inputTokens" IS NULL AND "outputTokens" IS NULL AND "totalTokens" IS NULL)
 OR ("usageSource"='PROVIDER_REPORTED' AND ("inputTokens" IS NOT NULL OR "outputTokens" IS NOT NULL OR "totalTokens" IS NOT NULL)))
);
-- Mutable context titles participate in the same authoritative snapshot revision.
-- Lock conversations in stable order; never acquire queue/turn locks from this trigger.
CREATE FUNCTION bump_formula_conversation_revisions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid;
BEGIN
 FOR target_id IN
   SELECT c.id FROM conversations c JOIN formula_versions v ON v.id=c."formulaVersionId" AND v."ownerId"=c."ownerId"
   WHERE v."formulaId"=NEW.id AND v."ownerId"=NEW."ownerId" ORDER BY c.id FOR UPDATE OF c
 LOOP
   UPDATE conversations SET revision=revision+1 WHERE id=target_id;
 END LOOP;
 RETURN NEW;
END;
$$;
CREATE TRIGGER formula_title_conversation_revision AFTER UPDATE OF title ON formulas
FOR EACH ROW WHEN (OLD.title IS DISTINCT FROM NEW.title) EXECUTE FUNCTION bump_formula_conversation_revisions();
COMMIT;
