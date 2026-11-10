CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_assets_search_trgm ON assets USING gin (
  (coalesce(name, '') || chr(31) || coalesce(asset_code, '') || chr(31) || coalesce(serial_number, '') || chr(31) || coalesce(assigned_employee, '') || chr(31) || coalesce(category, '')) gin_trgm_ops
);

CREATE INDEX IF NOT EXISTS idx_assets_created_id ON assets (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_assets_filter_counts ON assets (status, plant_id, dept_id, category);
CREATE INDEX IF NOT EXISTS idx_assets_plant_status_category ON assets (plant_id, status, category);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_user_id ON assets (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_asset_audit_details_trgm ON audit_logs USING gin (details gin_trgm_ops) WHERE module = 'Assets';
