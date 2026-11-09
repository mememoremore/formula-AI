-- Nullable additive field: preserve batches, tasks, idempotency keys and worker leases.
ALTER TABLE "recognition_batches" ADD COLUMN "historyDeletedAt" TIMESTAMPTZ(3);
