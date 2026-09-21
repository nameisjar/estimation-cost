ALTER TABLE building_footprints
  ADD COLUMN IF NOT EXISTS address text;

CREATE TABLE IF NOT EXISTS osm_pois (
  source_id text PRIMARY KEY,
  name text NOT NULL,
  category text NOT NULL,
  address text,
  location geometry(Point, 4326) NOT NULL,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT osm_pois_source_id_format CHECK (source_id ~ '^(node|way|relation)/[0-9]+$')
);

CREATE INDEX IF NOT EXISTS osm_pois_location_gix
  ON osm_pois USING gist (location);

CREATE INDEX IF NOT EXISTS osm_pois_category_idx
  ON osm_pois (category);
