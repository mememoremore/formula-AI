BEGIN;
ALTER TABLE "recognition_batches"
  DROP CONSTRAINT "recognition_batches_status_check",
  ADD CONSTRAINT "recognition_batches_status_check" CHECK ("status" IN ('RUNNING','PAUSED','COMPLETED','CANCELLED'));
COMMIT;
