-- Run this in pgAdmin Query Tool on your assethub database (production + dev).
--
-- 1. assets_serial_number_key (UNIQUE on serial_number) is too strict for real
--    asset registers — many assets share a serial or have none. Bulk uploads
--    with legitimate duplicate/blank serials were being rejected row-by-row.
--
-- 2. assets_asset_code_key (UNIQUE on asset_code alone) is a leftover from
--    before the parent/child sub-asset redesign (see 004). It is fully
--    superseded by uq_asset_code_sub (asset_code, sub_sequence) and currently
--    blocks any sub-asset (sub_sequence > 0) from ever being inserted for an
--    asset_code that already has a root record.

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_serial_number_key;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_asset_code_key;

-- Verify — should show only uq_asset_code_sub and no per-column unique on
-- serial_number or asset_code alone.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'assets'::regclass AND contype = 'u';
