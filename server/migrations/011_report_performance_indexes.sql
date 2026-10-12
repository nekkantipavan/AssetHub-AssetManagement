-- Migration 011: Add indexes for asset report performance
-- The asset report JOIN on asset_masters(type, value) was doing a seq scan
-- for every asset row, causing slow queries on large datasets.

-- Composite index for the cost_center description lookup in reports
CREATE INDEX IF NOT EXISTS idx_asset_masters_type_value
  ON asset_masters (type, value);

-- Index on assets.created_at for ORDER BY in report queries
CREATE INDEX IF NOT EXISTS idx_assets_created_at
  ON assets (created_at DESC);

-- Index on assets foreign keys used in report JOINs
CREATE INDEX IF NOT EXISTS idx_assets_plant_id    ON assets (plant_id);
CREATE INDEX IF NOT EXISTS idx_assets_dept_id     ON assets (dept_id);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_user_id ON assets (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_assets_cost_center ON assets (cost_center);
