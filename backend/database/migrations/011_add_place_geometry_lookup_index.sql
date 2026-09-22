CREATE INDEX IF NOT EXISTS places_location_geometry_gix
  ON places USING gist ((location::geometry));

