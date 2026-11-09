BEGIN;
-- History removal must not break formula, original-image, export or worker associations.
ALTER TABLE recognition_tasks ADD COLUMN "historyDeletedAt" TIMESTAMPTZ(3);
-- Track explicit conversation names separately from auto-generated formula titles.
ALTER TABLE conversations ADD COLUMN "customTitle" VARCHAR(40);
-- Preserve prior user names where they differ from the generated defaults.
UPDATE conversations c SET "customTitle" = c.title
WHERE char_length(c.title) <= 40
  AND c.title NOT IN ('普通对话', '未命名', '未命名对话', '未命名公式', '未命名公式 解释')
  AND c.title !~ '^(未命名公式|公式识别结果|[a-fA-F0-9-]{24,64})( · v[0-9]+)?( 解释)?$'
  AND NOT EXISTS (
    SELECT 1 FROM formula_versions v JOIN formulas f ON f.id=v."formulaId" AND f."ownerId"=v."ownerId"
    WHERE v.id=c."formulaVersionId" AND v."ownerId"=c."ownerId"
      AND (c.title=f.title OR c.title=left(f.title || ' 解释', 100))
  );
COMMIT;
