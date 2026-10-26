ALTER TABLE "chat_turns"
  ADD COLUMN "partialContent" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "responseIsMock" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "responseModel" VARCHAR(100);

ALTER TABLE "chat_turns" ADD CONSTRAINT chat_turns_partial_length
  CHECK (length("partialContent") <= 16000);
