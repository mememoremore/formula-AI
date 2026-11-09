-- Account deletion cascades through batches and stored files at different depths.
-- Check these references at commit, after the complete cascade has finished.
BEGIN;
ALTER TABLE recognition_batch_images ALTER CONSTRAINT recognition_batch_images_fileid_ownerid_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE recognition_batch_parts ALTER CONSTRAINT recognition_batch_parts_fileid_ownerid_fkey DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE recognition_batch_parts ALTER CONSTRAINT recognition_batch_parts_taskid_ownerid_fkey DEFERRABLE INITIALLY DEFERRED;
COMMIT;
