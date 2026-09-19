ALTER TABLE places
  ADD COLUMN IF NOT EXISTS address_source text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS address_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS address_updated_at timestamptz;

UPDATE places
SET address_source = CASE
      WHEN trim(address) = '' OR address = 'Alamat belum tersedia' THEN 'missing'
      WHEN source = 'admin' THEN 'manual'
      ELSE 'survey'
    END,
    address_verified = CASE
      WHEN source = 'admin' AND trim(address) <> '' AND address <> 'Alamat belum tersedia' THEN true
      ELSE false
    END,
    address_updated_at = CASE
      WHEN trim(address) = '' OR address = 'Alamat belum tersedia' THEN NULL
      ELSE updated_at
    END;

ALTER TABLE places DROP CONSTRAINT IF EXISTS places_address_source_valid;
ALTER TABLE places ADD CONSTRAINT places_address_source_valid
  CHECK (address_source IN ('missing', 'survey', 'automatic', 'manual'));

CREATE INDEX IF NOT EXISTS places_address_status_idx
  ON places (address_source, address_verified, active);
