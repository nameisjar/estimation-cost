ALTER TABLE places
  ADD COLUMN IF NOT EXISTS icon_type text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS icon_type_verified boolean NOT NULL DEFAULT false;

UPDATE places
SET icon_type = CASE
  WHEN lower(name) ~ '(rumah sakit|hospital|rumkital|(^|[^a-z])(rs|rsud|rsal|rst|rsu|rsia)([^a-z]|$))' THEN 'hospital'
  WHEN lower(name) ~ '(puskesmas|klinik|clinic|medical center|balai pengobatan)' THEN 'clinic'
  WHEN lower(name) ~ '(apotek|farmasi|pharmacy)' THEN 'pharmacy'
  WHEN lower(name) ~ '(dokter|doctor|drg|praktik dr)' THEN 'doctor'
  WHEN lower(name) ~ '(universitas|university|kampus|akademi|politeknik|sekolah tinggi)' THEN 'university'
  WHEN lower(name) ~ '(sekolah|school|paud|(^|[^a-z])(tk|sd|smp|sma|smk)([^a-z]|$)|madrasah|pesantren)' THEN 'school'
  WHEN lower(name) ~ '(perpustakaan|library)' THEN 'education'
  WHEN lower(name) ~ '(masjid|mushola|musala|mosque)' THEN 'mosque'
  WHEN lower(name) ~ '(gereja|church|kapel|katedral)' THEN 'church'
  WHEN lower(name) ~ '(bakery|roti|toko kue)' THEN 'bakery'
  WHEN lower(name) ~ '(cafe|café|kafe|coffee|kopi)' THEN 'cafe'
  WHEN lower(name) ~ '(restoran|restaurant|rumah makan|warung|bakso|kuliner|lalapan|martabak|makanan)' THEN 'restaurant'
  WHEN lower(name) ~ '(hotel|homestay|guest house|guesthouse|penginapan|resort|losmen)' THEN 'lodging'
  WHEN lower(name) ~ '(^|[^a-z])atm([^a-z]|$)' THEN 'atm'
  WHEN lower(name) ~ '(bank|koperasi|finance|pegadaian)' THEN 'bank'
  WHEN lower(name) ~ '(spbu|pom bensin|pertashop|fuel)' THEN 'fuel'
  WHEN lower(name) ~ '(bengkel|service motor|service mobil|tambal ban|otomotif)' THEN 'repair'
  WHEN lower(name) ~ '(rental (mobil|motor)|dealer)' THEN 'automotive'
  WHEN lower(name) ~ '(polisi|polres|polsek|polresta)' THEN 'police'
  WHEN lower(name) ~ '(kantor pos|post office)' THEN 'post-office'
  WHEN lower(name) ~ '(bandara|airport)' THEN 'airport'
  WHEN lower(name) ~ '(pelabuhan|dermaga)' THEN 'port'
  WHEN lower(name) ~ '(terminal|halte|stasiun)' THEN 'terminal'
  WHEN lower(name) ~ '(ekspedisi|logistik|cargo|kurir|express)' THEN 'delivery'
  WHEN lower(name) ~ '(transport|transportasi)' THEN 'transport'
  WHEN lower(name) ~ '(pasar|market|supermarket|minimarket|swalayan|mall)' THEN 'market'
  WHEN lower(name) ~ '(toko|shop|butik|store|elektronik|pakaian)' THEN 'shop'
  WHEN lower(name) ~ '(laundry|binatu)' THEN 'laundry'
  WHEN lower(name) ~ '(salon|barbershop|pangkas rambut)' THEN 'salon'
  WHEN lower(name) ~ '((^|[^a-z])tps([^a-z]|$)|tempat pembuangan|bank sampah|pengolahan sampah)' THEN 'waste'
  WHEN category IN ('medical', 'education', 'worship', 'food', 'lodging', 'finance',
                    'automotive', 'government', 'transport', 'retail', 'service') THEN category
  ELSE 'other'
END
WHERE NOT icon_type_verified;

UPDATE places
SET category = CASE
  WHEN icon_type IN ('hospital', 'clinic', 'pharmacy', 'doctor', 'medical') THEN 'medical'
  WHEN icon_type IN ('school', 'university', 'education') THEN 'education'
  WHEN icon_type IN ('mosque', 'church', 'worship') THEN 'worship'
  WHEN icon_type IN ('restaurant', 'cafe', 'bakery', 'food') THEN 'food'
  WHEN icon_type = 'lodging' THEN 'lodging'
  WHEN icon_type IN ('bank', 'atm', 'finance') THEN 'finance'
  WHEN icon_type IN ('fuel', 'repair', 'automotive') THEN 'automotive'
  WHEN icon_type IN ('police', 'post-office', 'government') THEN 'government'
  WHEN icon_type IN ('airport', 'port', 'terminal', 'delivery', 'transport') THEN 'transport'
  WHEN icon_type IN ('market', 'shop', 'retail') THEN 'retail'
  WHEN icon_type IN ('laundry', 'salon', 'waste', 'service') THEN 'service'
  ELSE category
END
WHERE NOT icon_type_verified;

ALTER TABLE places DROP CONSTRAINT IF EXISTS places_icon_type_valid;
ALTER TABLE places ADD CONSTRAINT places_icon_type_valid CHECK (icon_type IN (
  'hospital', 'clinic', 'pharmacy', 'doctor', 'medical',
  'school', 'university', 'education', 'mosque', 'church', 'worship',
  'restaurant', 'cafe', 'bakery', 'food', 'lodging',
  'bank', 'atm', 'finance', 'fuel', 'repair', 'automotive',
  'police', 'post-office', 'government', 'airport', 'port', 'terminal',
  'delivery', 'transport', 'market', 'shop', 'retail', 'laundry',
  'salon', 'waste', 'service', 'other'
));

CREATE INDEX IF NOT EXISTS places_icon_type_idx ON places (icon_type, active);

CREATE OR REPLACE FUNCTION refresh_place_search_text()
RETURNS trigger AS $$
BEGIN
  NEW.search_text := lower(unaccent(concat_ws(' ',
    NEW.name,
    NEW.category,
    NEW.icon_type,
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
BEFORE INSERT OR UPDATE OF name, category, icon_type, address, aliases, search_keyword, search_area
ON places
FOR EACH ROW EXECUTE FUNCTION refresh_place_search_text();

UPDATE places SET name = name;
