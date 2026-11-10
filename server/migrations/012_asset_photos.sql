CREATE TABLE IF NOT EXISTS asset_photos (
  id uuid PRIMARY KEY,
  asset_id integer NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asset_photos_asset_created
  ON asset_photos (asset_id, created_at, id);
