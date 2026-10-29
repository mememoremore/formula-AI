-- 与枚举扩展分开提交，避免 PostgreSQL 在同一事务内使用刚添加的枚举值。
BEGIN;
ALTER TABLE resource_leases DROP CONSTRAINT "resource_leases_fileId_fkey";
ALTER TABLE resource_leases ADD CONSTRAINT "resource_leases_fileId_ownerId_fkey"
 FOREIGN KEY ("fileId", "ownerId") REFERENCES stored_files(id, "ownerId") ON DELETE NO ACTION ON UPDATE RESTRICT;
-- 新类型没有历史数据；旧 IMAGE/DOCX 的约束与记录保持不变。
ALTER TABLE stored_files ADD CONSTRAINT stored_files_avatar_limits CHECK (
 kind <> 'AVATAR' OR ("mimeType" = 'image/webp' AND "sizeBytes" <= 1048576 AND width = 512 AND height = 512
 AND "contentHash" IS NOT NULL AND "uploadKey" IS NOT NULL)
);
COMMIT;
