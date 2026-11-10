-- Additive and idempotent. Never removes or merges existing assets.
-- Apply before deploying the bulk create/update workflow.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'assets'::regclass AND c.contype IN ('u', 'p')
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
           FROM unnest(c.conkey) k(attnum)
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)
          = ARRAY['asset_code', 'sub_sequence']::text[]
  ) THEN
    ALTER TABLE assets ADD CONSTRAINT uq_asset_code_sub UNIQUE (asset_code, sub_sequence);
  END IF;
END $$;
COMMIT;
