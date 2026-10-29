BEGIN;
CREATE TYPE "ConversationPurpose" AS ENUM ('CHAT','EXPLANATION');
CREATE TYPE "ChatResponseKind" AS ENUM ('TEXT','FORMULA_EXPLANATION');
ALTER TABLE conversations ADD COLUMN purpose "ConversationPurpose" NOT NULL DEFAULT 'CHAT';
ALTER TABLE chat_turns ADD COLUMN "responseKind" "ChatResponseKind" NOT NULL DEFAULT 'TEXT', ADD COLUMN "promptVersion" VARCHAR(64), ADD COLUMN "requestHash" CHAR(64);
ALTER TABLE chat_messages ADD COLUMN "structuredContent" JSONB;
ALTER TABLE conversations ADD CONSTRAINT explanation_fixed_version CHECK (purpose <> 'EXPLANATION' OR "formulaVersionId" IS NOT NULL);
ALTER TABLE chat_turns ADD CONSTRAINT explanation_request_identity CHECK ("responseKind" <> 'FORMULA_EXPLANATION' OR ("promptVersion" IS NOT NULL AND length("promptVersion") > 0 AND "requestHash" IS NOT NULL AND "requestHash" ~ '^[0-9a-f]{64}$'));
ALTER TABLE chat_messages ADD CONSTRAINT explanation_message_shape CHECK ("structuredContent" IS NULL OR (role='ASSISTANT' AND status='COMPLETED' AND "turnId" IS NOT NULL AND jsonb_typeof("structuredContent")='object' AND ("structuredContent"->>'schemaVersion') IS NOT DISTINCT FROM '1'));
CREATE INDEX conversations_explanation_history_idx ON conversations("ownerId",purpose,"formulaVersionId","createdAt" DESC,id DESC);
-- 解释身份和成功结果不可原地改写；旧文本消息行为不变。
CREATE UNIQUE INDEX chat_turns_one_explanation ON chat_turns("conversationId") WHERE "responseKind"='FORMULA_EXPLANATION';
CREATE FUNCTION protect_explanation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='conversations' AND NEW.purpose IS DISTINCT FROM OLD.purpose THEN RAISE EXCEPTION 'conversation_purpose_is_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER conversations_fixed_purpose BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION protect_explanation_identity();
CREATE FUNCTION protect_explanation_turn() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."responseKind",NEW."promptVersion",NEW."requestHash") IS DISTINCT FROM ROW(OLD."responseKind",OLD."promptVersion",OLD."requestHash") THEN RAISE EXCEPTION 'turn_request_is_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER chat_turns_fixed_request BEFORE UPDATE ON chat_turns FOR EACH ROW EXECUTE FUNCTION protect_explanation_turn();
CREATE FUNCTION protect_explanation_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD."structuredContent" IS NOT NULL OR NEW."structuredContent" IS NOT NULL) AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'explanation_message_is_immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER chat_messages_fixed_explanation BEFORE UPDATE ON chat_messages FOR EACH ROW EXECUTE FUNCTION protect_explanation_message();
COMMIT;
