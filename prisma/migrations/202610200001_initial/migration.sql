-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('IMAGE', 'DOCX');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'READY', 'DELETED');

-- CreateEnum
CREATE TYPE "RecognitionMode" AS ENUM ('HANDWRITTEN', 'PRINTED');

-- CreateEnum
CREATE TYPE "RecognitionStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "VersionOrigin" AS ENUM ('RECOGNITION', 'MANUAL', 'DEMO');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('STREAMING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "kind" "FileKind" NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "bucket" VARCHAR(100) NOT NULL,
    "objectKey" VARCHAR(512) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recognition_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "inputFileId" UUID NOT NULL,
    "requestKey" VARCHAR(100) NOT NULL,
    "mode" "RecognitionMode" NOT NULL,
    "status" "RecognitionStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "errorCode" VARCHAR(100),
    "errorMessage" VARCHAR(1000),
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recognition_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "categoryId" UUID,
    "recognitionTaskId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formula_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "formulaId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "latex" TEXT NOT NULL,
    "origin" "VersionOrigin" NOT NULL,
    "modelVersion" VARCHAR(100),
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DECIMAL(5,4),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formula_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "ownerId" UUID NOT NULL,
    "formulaId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("ownerId","formulaId")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" UUID NOT NULL,
    "formulaVersionId" UUID,
    "title" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversationId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "role" "MessageRole" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'COMPLETED',
    "content" TEXT NOT NULL,
    "isMock" BOOLEAN NOT NULL DEFAULT false,
    "modelVersion" VARCHAR(100),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "stored_files_ownerId_createdAt_id_idx" ON "stored_files"("ownerId", "createdAt" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_id_ownerId_key" ON "stored_files"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_bucket_objectKey_key" ON "stored_files"("bucket", "objectKey");

-- CreateIndex
CREATE INDEX "recognition_tasks_ownerId_createdAt_id_idx" ON "recognition_tasks"("ownerId", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "recognition_tasks_inputFileId_ownerId_idx" ON "recognition_tasks"("inputFileId", "ownerId");

-- CreateIndex
CREATE INDEX "recognition_tasks_status_createdAt_idx" ON "recognition_tasks"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "recognition_tasks_id_ownerId_key" ON "recognition_tasks"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "recognition_tasks_ownerId_requestKey_key" ON "recognition_tasks"("ownerId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_ownerId_key" ON "categories"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_ownerId_name_key" ON "categories"("ownerId", "name");

-- CreateIndex
CREATE INDEX "formulas_ownerId_updatedAt_id_idx" ON "formulas"("ownerId", "updatedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "formulas_categoryId_ownerId_idx" ON "formulas"("categoryId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "formulas_id_ownerId_key" ON "formulas"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "formulas_recognitionTaskId_ownerId_key" ON "formulas"("recognitionTaskId", "ownerId");

-- CreateIndex
CREATE INDEX "formula_versions_formulaId_ownerId_idx" ON "formula_versions"("formulaId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "formula_versions_id_ownerId_key" ON "formula_versions"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "formula_versions_formulaId_number_key" ON "formula_versions"("formulaId", "number");

-- CreateIndex
CREATE INDEX "favorites_ownerId_createdAt_formulaId_idx" ON "favorites"("ownerId", "createdAt" DESC, "formulaId");

-- CreateIndex
CREATE INDEX "favorites_formulaId_ownerId_idx" ON "favorites"("formulaId", "ownerId");

-- CreateIndex
CREATE INDEX "conversations_ownerId_updatedAt_id_idx" ON "conversations"("ownerId", "updatedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "conversations_formulaVersionId_ownerId_idx" ON "conversations"("formulaVersionId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_id_ownerId_key" ON "conversations"("id", "ownerId");

-- CreateIndex
CREATE INDEX "chat_messages_conversationId_ownerId_idx" ON "chat_messages"("conversationId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_conversationId_position_key" ON "chat_messages"("conversationId", "position");

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition_tasks" ADD CONSTRAINT "recognition_tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognition_tasks" ADD CONSTRAINT "recognition_tasks_inputFileId_ownerId_fkey" FOREIGN KEY ("inputFileId", "ownerId") REFERENCES "stored_files"("id", "ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_categoryId_ownerId_fkey" FOREIGN KEY ("categoryId", "ownerId") REFERENCES "categories"("id", "ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formulas" ADD CONSTRAINT "formulas_recognitionTaskId_ownerId_fkey" FOREIGN KEY ("recognitionTaskId", "ownerId") REFERENCES "recognition_tasks"("id", "ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "formula_versions" ADD CONSTRAINT "formula_versions_formulaId_ownerId_fkey" FOREIGN KEY ("formulaId", "ownerId") REFERENCES "formulas"("id", "ownerId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_formulaId_ownerId_fkey" FOREIGN KEY ("formulaId", "ownerId") REFERENCES "formulas"("id", "ownerId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_formulaVersionId_ownerId_fkey" FOREIGN KEY ("formulaVersionId", "ownerId") REFERENCES "formula_versions"("id", "ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_ownerId_fkey" FOREIGN KEY ("conversationId", "ownerId") REFERENCES "conversations"("id", "ownerId") ON DELETE CASCADE ON UPDATE RESTRICT;
