CREATE TABLE IF NOT EXISTS building_footprints (
  source_id text PRIMARY KEY,
  name text,
  building_type text NOT NULL DEFAULT 'yes',
  geometry geometry(MultiPolygon, 4326) NOT NULL,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT building_footprints_source_id_format CHECK (source_id ~ '^(way|relation)/[0-9]+$'),
  CONSTRAINT building_footprints_geometry_valid CHECK (NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry))
);

CREATE INDEX IF NOT EXISTS building_footprints_geometry_gix
  ON building_footprints USING gist (geometry);

CREATE INDEX IF NOT EXISTS building_footprints_type_idx
  ON building_footprints (building_type);
