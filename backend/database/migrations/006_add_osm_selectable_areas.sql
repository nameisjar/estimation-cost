CREATE TABLE IF NOT EXISTS osm_areas (
  source_id text PRIMARY KEY,
  name text,
  area_type text NOT NULL,
  address text,
  geometry geometry(MultiPolygon, 4326) NOT NULL,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT osm_areas_source_id_format CHECK (source_id ~ '^(way|relation)/[0-9]+$'),
  CONSTRAINT osm_areas_geometry_valid CHECK (NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry))
);

CREATE INDEX IF NOT EXISTS osm_areas_geometry_gix
  ON osm_areas USING gist (geometry);

CREATE INDEX IF NOT EXISTS osm_areas_type_idx
  ON osm_areas (area_type);
