-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('RECOGNITION', 'CHAT', 'EXPORT');

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "turnId" UUID;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "requestKey" VARCHAR(100);

-- AlterTable
ALTER TABLE "recognition_tasks" ADD COLUMN     "queueJobId" UUID;

-- CreateTable
CREATE TABLE "daily_usage" (
    "ownerId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "kind" "UsageKind" NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_usage_pkey" PRIMARY KEY ("ownerId","day","kind")
);

-- CreateTable
CREATE TABLE "chat_turns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "requestKey" VARCHAR(100) NOT NULL,
    "question" VARCHAR(2000) NOT NULL,
    "status" "RecognitionStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "queueJobId" UUID,
    "errorMessage" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "chat_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "formulaVersionId" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "requestKey" VARCHAR(100) NOT NULL,
    "status" "RecognitionStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "queueJobId" UUID,
    "fileId" UUID,
    "errorMessage" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "export_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_turns_queueJobId_key" ON "chat_turns"("queueJobId");

-- CreateIndex
CREATE INDEX "chat_turns_conversationId_ownerId_createdAt_idx" ON "chat_turns"("conversationId", "ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "chat_turns_id_ownerId_key" ON "chat_turns"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_turns_ownerId_requestKey_key" ON "chat_turns"("ownerId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "export_tasks_queueJobId_key" ON "export_tasks"("queueJobId");

-- CreateIndex
CREATE UNIQUE INDEX "export_tasks_fileId_key" ON "export_tasks"("fileId");

-- CreateIndex
CREATE INDEX "export_tasks_ownerId_createdAt_id_idx" ON "export_tasks"("ownerId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "export_tasks_id_ownerId_key" ON "export_tasks"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "export_tasks_ownerId_requestKey_key" ON "export_tasks"("ownerId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_turnId_role_key" ON "chat_messages"("turnId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_ownerId_requestKey_key" ON "conversations"("ownerId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "recognition_tasks_queueJobId_key" ON "recognition_tasks"("queueJobId");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_turnId_ownerId_fkey" FOREIGN KEY ("turnId", "ownerId") REFERENCES "chat_turns"("id", "ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "daily_usage" ADD CONSTRAINT "daily_usage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_conversationId_ownerId_fkey" FOREIGN KEY ("conversationId", "ownerId") REFERENCES "conversations"("id", "ownerId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "export_tasks" ADD CONSTRAINT "export_tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_tasks" ADD CONSTRAINT "export_tasks_formulaVersionId_ownerId_fkey" FOREIGN KEY ("formulaVersionId", "ownerId") REFERENCES "formula_versions"("id", "ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "export_tasks" ADD CONSTRAINT "export_tasks_fileId_ownerId_fkey" FOREIGN KEY ("fileId", "ownerId") REFERENCES "stored_files"("id", "ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT;

ALTER TABLE daily_usage ADD CONSTRAINT daily_usage_nonnegative CHECK (used >= 0);
CREATE UNIQUE INDEX chat_turns_one_active_per_conversation ON chat_turns("conversationId") WHERE status IN ('QUEUED', 'PROCESSING');
ALTER TABLE chat_turns
  ADD CONSTRAINT chat_turns_question_length CHECK (length(btrim(question)) BETWEEN 1 AND 2000),
  ADD CONSTRAINT chat_turns_attempt_bounds CHECK ("attemptCount" BETWEEN 0 AND "maxAttempts" AND "maxAttempts" BETWEEN 1 AND 10),
  ADD CONSTRAINT chat_turns_terminal_time CHECK (status NOT IN ('COMPLETED', 'FAILED') OR "finishedAt" IS NOT NULL);
ALTER TABLE export_tasks
  ADD CONSTRAINT export_tasks_attempt_bounds CHECK ("attemptCount" BETWEEN 0 AND "maxAttempts" AND "maxAttempts" BETWEEN 1 AND 10),
  ADD CONSTRAINT export_tasks_terminal_time CHECK (status NOT IN ('COMPLETED', 'FAILED') OR "finishedAt" IS NOT NULL),
  ADD CONSTRAINT export_tasks_complete_file CHECK (status <> 'COMPLETED' OR "fileId" IS NOT NULL);
CREATE FUNCTION preserve_export_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."formulaVersionId" IS DISTINCT FROM OLD."formulaVersionId" OR NEW."ownerId" IS DISTINCT FROM OLD."ownerId" OR NEW.title IS DISTINCT FROM OLD.title THEN
    RAISE EXCEPTION 'export_context_is_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER export_tasks_fixed_context BEFORE UPDATE ON export_tasks FOR EACH ROW EXECUTE FUNCTION preserve_export_context();
