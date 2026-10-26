-- Prisma 描述关系结构；以下 PostgreSQL 约束保护数据库中的实际数据。
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_canonical" CHECK (length("email") > 0 AND "email" = lower(btrim("email"))),
  ADD CONSTRAINT "users_display_name_nonempty" CHECK (length(btrim("displayName")) > 0);

ALTER TABLE "stored_files"
  ADD CONSTRAINT "stored_files_names_nonempty" CHECK (length(btrim("bucket")) > 0 AND length(btrim("objectKey")) > 0 AND length(btrim("name")) > 0),
  ADD CONSTRAINT "stored_files_positive_size" CHECK ("sizeBytes" > 0),
  ADD CONSTRAINT "stored_files_image_limits" CHECK ("kind" <> 'IMAGE' OR ("mimeType" IN ('image/jpeg', 'image/png') AND "sizeBytes" <= 10485760)),
  ADD CONSTRAINT "stored_files_docx_type" CHECK ("kind" <> 'DOCX' OR "mimeType" = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  ADD CONSTRAINT "stored_files_dimensions" CHECK (
    ("width" IS NULL AND "height" IS NULL)
    OR ("width" IS NOT NULL AND "height" IS NOT NULL AND "width" > 0 AND "height" > 0 AND "width"::bigint * "height"::bigint <= 20000000)
  ),
  ADD CONSTRAINT "stored_files_ready_image_dimensions" CHECK ("kind" <> 'IMAGE' OR "status" <> 'READY' OR ("width" IS NOT NULL AND "height" IS NOT NULL));

ALTER TABLE "recognition_tasks"
  ADD CONSTRAINT "recognition_tasks_request_key_nonempty" CHECK (length(btrim("requestKey")) > 0),
  ADD CONSTRAINT "recognition_tasks_attempt_bounds" CHECK ("attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 10 AND "attemptCount" <= "maxAttempts"),
  ADD CONSTRAINT "recognition_tasks_terminal_time" CHECK ("status" NOT IN ('COMPLETED', 'FAILED') OR "finishedAt" IS NOT NULL),
  ADD CONSTRAINT "recognition_tasks_processing_time" CHECK ("status" <> 'PROCESSING' OR ("startedAt" IS NOT NULL AND "finishedAt" IS NULL)),
  ADD CONSTRAINT "recognition_tasks_queued_time" CHECK ("status" <> 'QUEUED' OR "finishedAt" IS NULL),
  ADD CONSTRAINT "recognition_tasks_completed_attempt" CHECK ("status" <> 'COMPLETED' OR ("startedAt" IS NOT NULL AND "attemptCount" > 0)),
  ADD CONSTRAINT "recognition_tasks_failed_error" CHECK ("status" <> 'FAILED' OR ("errorCode" IS NOT NULL AND length(btrim("errorCode")) > 0)),
  ADD CONSTRAINT "recognition_tasks_time_order" CHECK (("startedAt" IS NULL OR "startedAt" >= "createdAt") AND ("finishedAt" IS NULL OR ("finishedAt" >= "createdAt" AND ("startedAt" IS NULL OR "finishedAt" >= "startedAt"))));

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_name_nonempty" CHECK (length("name") > 0 AND "name" = btrim("name"));

ALTER TABLE "formulas"
  ADD CONSTRAINT "formulas_title_nonempty" CHECK (length(btrim("title")) > 0);

ALTER TABLE "formula_versions"
  ADD CONSTRAINT "formula_versions_positive_number" CHECK ("number" > 0),
  ADD CONSTRAINT "formula_versions_latex_length" CHECK (length(btrim("latex")) BETWEEN 1 AND 5000),
  ADD CONSTRAINT "formula_versions_origin_order" CHECK (("number" = 1 AND "origin" IN ('RECOGNITION', 'DEMO')) OR ("number" > 1 AND "origin" = 'MANUAL')),
  ADD CONSTRAINT "formula_versions_confidence_range" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  ADD CONSTRAINT "formula_versions_no_mock_confidence" CHECK (NOT "isMock" OR "confidence" IS NULL),
  ADD CONSTRAINT "formula_versions_no_manual_confidence" CHECK ("origin" <> 'MANUAL' OR "confidence" IS NULL),
  ADD CONSTRAINT "formula_versions_demo_is_mock" CHECK ("origin" <> 'DEMO' OR "isMock");

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_title_nonempty" CHECK (length(btrim("title")) > 0);

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_positive_position" CHECK ("position" > 0),
  ADD CONSTRAINT "chat_messages_content_length" CHECK (length("content") <= CASE WHEN "role" = 'USER' THEN 2000 ELSE 50000 END),
  ADD CONSTRAINT "chat_messages_completed_content" CHECK ("status" <> 'COMPLETED' OR length(btrim("content")) > 0);

CREATE FUNCTION "reject_formula_version_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'formula_versions_are_immutable: append a new version instead' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "formula_versions_immutable"
BEFORE UPDATE ON "formula_versions"
FOR EACH ROW EXECUTE FUNCTION "reject_formula_version_update"();

CREATE FUNCTION "preserve_conversation_context"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."formulaVersionId" IS DISTINCT FROM OLD."formulaVersionId" OR NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
    RAISE EXCEPTION 'conversation_context_is_immutable: open a new conversation instead' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "conversations_fixed_context"
BEFORE UPDATE ON "conversations"
FOR EACH ROW EXECUTE FUNCTION "preserve_conversation_context"();
