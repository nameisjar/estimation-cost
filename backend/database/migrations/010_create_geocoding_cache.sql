CREATE TABLE IF NOT EXISTS geocoding_cache (
  cache_key text PRIMARY KEY,
  payload jsonb,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geocoding_cache_expires_at_idx
  ON geocoding_cache (expires_at);
