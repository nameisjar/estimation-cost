ALTER TABLE places DROP CONSTRAINT IF EXISTS places_icon_type_valid;

ALTER TABLE places ADD CONSTRAINT places_icon_type_valid CHECK (icon_type IN (
  'hospital', 'clinic', 'pharmacy', 'doctor', 'dentist', 'veterinary', 'optician', 'midwife', 'physiotherapy', 'medical',
  'school', 'university', 'course', 'education',
  'mosque', 'church', 'worship',
  'restaurant', 'cafe', 'bakery', 'ice-cream', 'food-court', 'food',
  'lodging', 'boarding-house', 'apartment',
  'bank', 'atm', 'finance',
  'fuel', 'repair', 'car-wash', 'automotive',
  'police', 'fire-station', 'court', 'post-office', 'government',
  'airport', 'port', 'terminal', 'delivery', 'parking', 'travel', 'transport',
  'market', 'shop', 'grocery', 'fashion', 'electronics', 'furniture', 'retail',
  'laundry', 'salon', 'spa', 'tailor', 'photo', 'computer', 'internet', 'waste', 'service',
  'sports-field', 'football', 'basketball', 'stadium', 'gym', 'swimming', 'sports',
  'park', 'beach', 'museum', 'landmark', 'entertainment', 'attraction', 'tourism',
  'contractor', 'property', 'legal', 'accounting', 'business', 'other'
));
