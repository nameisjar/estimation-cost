UPDATE places
SET address = regexp_replace(
      address,
      'Kabupaten Semangga',
      CASE
        WHEN address ~* '(Bambu Pemali|Karang Indah|Kelapa Lima|Mandala|Maro|Rimba Jaya|Samkai|Seringgu Jaya|Wasur|Nasem)'
          THEN 'Distrik Merauke, Kabupaten Merauke'
        ELSE 'Kabupaten Merauke'
      END,
      'gi'
    ),
    address_updated_at = NOW(),
    updated_at = NOW()
WHERE address_source IN ('automatic', 'survey')
  AND address_verified = FALSE
  AND address ILIKE '%Kabupaten Semangga%';
