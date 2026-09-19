CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_place_id text UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  address text NOT NULL DEFAULT 'Alamat belum tersedia',
  aliases text[] NOT NULL DEFAULT '{}',
  location geography(Point, 4326) NOT NULL,
  rating numeric(2,1),
  review_count integer,
  phone text,
  website text,
  opening_hours text,
  google_maps_url text,
  search_keyword text,
  search_area text,
  collected_at timestamptz,
  source text NOT NULL DEFAULT 'antarfix_survey',
  verified boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  popularity integer NOT NULL DEFAULT 0,
  min_zoom smallint NOT NULL DEFAULT 16,
  label_priority smallint NOT NULL DEFAULT 0,
  search_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT places_rating_range CHECK (rating IS NULL OR rating BETWEEN 0 AND 5),
  CONSTRAINT places_review_count_positive CHECK (review_count IS NULL OR review_count >= 0),
  CONSTRAINT places_zoom_range CHECK (min_zoom BETWEEN 0 AND 22)
);

CREATE INDEX IF NOT EXISTS places_location_gix ON places USING gist (location);
CREATE INDEX IF NOT EXISTS places_search_text_trgm_idx ON places USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS places_active_zoom_idx ON places (active, min_zoom, label_priority DESC);

CREATE OR REPLACE FUNCTION refresh_place_search_text()
RETURNS trigger AS $$
BEGIN
  NEW.search_text := lower(unaccent(concat_ws(' ',
    NEW.name,
    NEW.category,
    NEW.address,
    array_to_string(NEW.aliases, ' '),
    NEW.search_keyword,
    NEW.search_area
  )));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS places_refresh_search_text ON places;
CREATE TRIGGER places_refresh_search_text
BEFORE INSERT OR UPDATE OF name, category, address, aliases, search_keyword, search_area
ON places
FOR EACH ROW EXECUTE FUNCTION refresh_place_search_text();

UPDATE places SET name = name WHERE search_text = '';
