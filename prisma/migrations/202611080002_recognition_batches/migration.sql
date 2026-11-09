BEGIN;
CREATE TABLE recognition_batches (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "ownerId" UUID NOT NULL, "requestKey" UUID NOT NULL,
 "requestHash" CHAR(64) NOT NULL, mode VARCHAR(8) NOT NULL CHECK (mode IN ('single','multiple')),
 status VARCHAR(12) NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','PAUSED','COMPLETED')),
 "errorMessage" VARCHAR(1000), "leaseToken" UUID, "leaseUntil" TIMESTAMPTZ(3),
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT recognition_batches_ownerId_fkey FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT recognition_batches_lease_pair CHECK (("leaseToken" IS NULL) = ("leaseUntil" IS NULL))
);
CREATE UNIQUE INDEX "recognition_batches_id_ownerId_key" ON recognition_batches(id,"ownerId");
CREATE UNIQUE INDEX "recognition_batches_ownerId_requestKey_key" ON recognition_batches("ownerId","requestKey");
CREATE INDEX "recognition_batches_ownerId_createdAt_id_idx" ON recognition_batches("ownerId","createdAt" DESC,id);
CREATE INDEX "recognition_batches_status_updatedAt_id_idx" ON recognition_batches(status,"updatedAt",id);
CREATE TABLE recognition_batch_images (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "batchId" UUID NOT NULL, "ownerId" UUID NOT NULL,
 "fileId" UUID NOT NULL, position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 9),
 CONSTRAINT recognition_batch_images_batchId_ownerId_fkey FOREIGN KEY ("batchId","ownerId") REFERENCES recognition_batches(id,"ownerId") ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT recognition_batch_images_fileId_ownerId_fkey FOREIGN KEY ("fileId","ownerId") REFERENCES stored_files(id,"ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "recognition_batch_images_id_ownerId_key" ON recognition_batch_images(id,"ownerId");
CREATE UNIQUE INDEX "recognition_batch_images_batchId_position_key" ON recognition_batch_images("batchId",position);
CREATE INDEX "recognition_batch_images_fileId_ownerId_idx" ON recognition_batch_images("fileId","ownerId");
CREATE TABLE recognition_batch_parts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "imageId" UUID NOT NULL, "ownerId" UUID NOT NULL,
 "fileId" UUID NOT NULL, position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 19),
 "requestKey" UUID NOT NULL DEFAULT gen_random_uuid(), "taskId" UUID, "errorMessage" VARCHAR(1000),
 CONSTRAINT recognition_batch_parts_imageId_ownerId_fkey FOREIGN KEY ("imageId","ownerId") REFERENCES recognition_batch_images(id,"ownerId") ON DELETE CASCADE ON UPDATE RESTRICT,
 CONSTRAINT recognition_batch_parts_fileId_ownerId_fkey FOREIGN KEY ("fileId","ownerId") REFERENCES stored_files(id,"ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT,
 CONSTRAINT recognition_batch_parts_taskId_ownerId_fkey FOREIGN KEY ("taskId","ownerId") REFERENCES recognition_tasks(id,"ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "recognition_batch_parts_imageId_position_key" ON recognition_batch_parts("imageId",position);
CREATE UNIQUE INDEX "recognition_batch_parts_taskId_ownerId_key" ON recognition_batch_parts("taskId","ownerId");
CREATE INDEX "recognition_batch_parts_fileId_ownerId_idx" ON recognition_batch_parts("fileId","ownerId");
COMMIT;
