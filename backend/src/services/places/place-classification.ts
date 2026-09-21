export const placeCategories = [
  'medical', 'education', 'worship', 'food', 'lodging', 'finance',
  'automotive', 'government', 'transport', 'retail', 'service',
  'sports', 'tourism', 'business', 'other',
] as const;

export type PlaceCategory = typeof placeCategories[number];

export const placeIconTypes = [
  'hospital', 'clinic', 'pharmacy', 'doctor', 'medical',
  'dentist', 'veterinary', 'optician', 'midwife', 'physiotherapy',
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
  'contractor', 'property', 'legal', 'accounting', 'business', 'other',
] as const;

export type PlaceIconType = typeof placeIconTypes[number];

const knownCategories = new Set<string>(placeCategories);
const defaultIcons: Record<PlaceCategory, PlaceIconType> = {
  medical: 'medical', education: 'education', worship: 'worship', food: 'food',
  lodging: 'lodging', finance: 'finance', automotive: 'automotive',
  government: 'government', transport: 'transport', retail: 'retail',
  service: 'service', sports: 'sports', tourism: 'tourism', business: 'business',
  other: 'other',
};

type ClassificationRule = {
  pattern: RegExp;
  category: PlaceCategory;
  iconType: PlaceIconType;
};

const rules: ClassificationRule[] = [
  { pattern: /\b(rumah sakit|hospital|rs\.?\s|rsud|rsal|rumkital|rst\.?|rsu\b|rsia\b)/, category: 'medical', iconType: 'hospital' },
  { pattern: /\b(puskesmas|klinik|clinic|medical center|balai pengobatan)/, category: 'medical', iconType: 'clinic' },
  { pattern: /\b(apotek|apotik|farmasi|farma|pharmacy)/, category: 'medical', iconType: 'pharmacy' },
  { pattern: /\b(dokter gigi|klinik gigi|dental|dentist)/, category: 'medical', iconType: 'dentist' },
  { pattern: /\b(klinik hewan|dokter hewan|veteriner|veterinary)/, category: 'medical', iconType: 'veterinary' },
  { pattern: /\b(optik|optician)/, category: 'medical', iconType: 'optician' },
  { pattern: /\b(bidan|midwife)/, category: 'medical', iconType: 'midwife' },
  { pattern: /\b(fisioterapi|physiotherapy|physio|bone setting)/, category: 'medical', iconType: 'physiotherapy' },
  { pattern: /\b(dokter|doctor|drg\.?|praktik dr\.?)/, category: 'medical', iconType: 'doctor' },
  { pattern: /\b(universitas|university|kampus|akademi|politeknik|sekolah tinggi)/, category: 'education', iconType: 'university' },
  { pattern: /\b(sekolah|school|paud|tk\.?\b|sd\.?\b|smp\.?\b|sma\.?\b|smk\.?\b|mi\.?\b|mts\.?\b|ma\.?\b|smtk\.?\b|madrasah|pesantren)/, category: 'education', iconType: 'school' },
  { pattern: /\b(perpustakaan|library)/, category: 'education', iconType: 'education' },
  { pattern: /\b(bimbingan belajar|bimbel|tempat kursus|kursus (komputer|bahasa)|primagama)/, category: 'education', iconType: 'course' },
  { pattern: /\b(masjid|mushola|musala|mosque)/, category: 'worship', iconType: 'mosque' },
  { pattern: /\b(gereja|church|kapel|katedral)/, category: 'worship', iconType: 'church' },
  { pattern: /\b(pura|vihara|wihara|tempat ibadah)/, category: 'worship', iconType: 'worship' },
  { pattern: /\b(bakery|roti|toko kue)/, category: 'food', iconType: 'bakery' },
  { pattern: /\b(es krim|ice cream|gelato)/, category: 'food', iconType: 'ice-cream' },
  { pattern: /\b(food court|pujasera|pusat jajan)/, category: 'food', iconType: 'food-court' },
  { pattern: /\b(cafe|café|kafe|coffee|kopi)/, category: 'food', iconType: 'cafe' },
  { pattern: /\b(restoran|restaurant|rumah makan|warung|bakso|mie ayam|mi ayam|nasi goreng|sate|satai|soto|gado[ -]?gado|pecel|rawon|rendang|ayam (geprek|goreng|bakar)|ikan bakar|seafood|pempek|seblak|batagor|siomay|depot|kantin|kedai|catering|katering|dapur|burger|pizza|kuliner|lalapan|martabak|makanan)/, category: 'food', iconType: 'restaurant' },
  { pattern: /\b(hotel|homestay|guest house|guesthouse|penginapan|resort|losmen|hostel)/, category: 'lodging', iconType: 'lodging' },
  { pattern: /\b(kos|kost|rumah kos|asrama)/, category: 'lodging', iconType: 'boarding-house' },
  { pattern: /\b(apartemen|apartment)/, category: 'lodging', iconType: 'apartment' },
  { pattern: /\b(atm)\b/, category: 'finance', iconType: 'atm' },
  { pattern: /\b(bank|koperasi|finance|pegadaian)/, category: 'finance', iconType: 'bank' },
  { pattern: /\b(spbu|pom bensin|pertashop|fuel)/, category: 'automotive', iconType: 'fuel' },
  { pattern: /\b(bengkel|service motor|service mobil|tambal ban|otomotif)/, category: 'automotive', iconType: 'repair' },
  { pattern: /\b(cuci (mobil|motor)|car wash)/, category: 'automotive', iconType: 'car-wash' },
  { pattern: /\b(rental (mobil|motor)|dealer)/, category: 'automotive', iconType: 'automotive' },
  { pattern: /\b(polisi|polres|polsek|polresta)/, category: 'government', iconType: 'police' },
  { pattern: /\b(pemadam kebakaran|damkar|fire station)/, category: 'government', iconType: 'fire-station' },
  { pattern: /\b(pengadilan|kejaksaan|court)/, category: 'government', iconType: 'court' },
  { pattern: /\b(kantor pos|post office)/, category: 'government', iconType: 'post-office' },
  { pattern: /\b(kantor pemerintah|kantor kecamatan|kantor desa|kelurahan|dinas\b|bupati|gubernur|imigrasi|kantor pajak|bpjs)/, category: 'government', iconType: 'government' },
  { pattern: /\b(bandara|airport)/, category: 'transport', iconType: 'airport' },
  { pattern: /\b(pelabuhan|port\b|dermaga)/, category: 'transport', iconType: 'port' },
  { pattern: /\b(terminal|halte|stasiun)/, category: 'transport', iconType: 'terminal' },
  { pattern: /\b(ekspedisi|logistik|cargo|kurir|express)/, category: 'transport', iconType: 'delivery' },
  { pattern: /\b(parkir|parking)/, category: 'transport', iconType: 'parking' },
  { pattern: /\b(travel|tour & travel|biro perjalanan|airlines)/, category: 'transport', iconType: 'travel' },
  { pattern: /\b(transport|transportasi)/, category: 'transport', iconType: 'transport' },
  { pattern: /\b(pasar|market|supermarket|minimarket|swalayan|mall)/, category: 'retail', iconType: 'market' },
  { pattern: /\b(toko (ikan|sayur|daging|buah|sembako|kelontong)|grosir)/, category: 'retail', iconType: 'grocery' },
  { pattern: /\b(toko (pakaian|sepatu)|butik|fashion)/, category: 'retail', iconType: 'fashion' },
  { pattern: /\b(toko (elektronik|handphone|hp|komputer)|ponsel)/, category: 'retail', iconType: 'electronics' },
  { pattern: /\b(toko mebel|furniture|mebel)/, category: 'retail', iconType: 'furniture' },
  { pattern: /\b(toko|shop|butik|store|elektronik|pakaian)/, category: 'retail', iconType: 'shop' },
  { pattern: /\b(laundry|binatu)/, category: 'service', iconType: 'laundry' },
  { pattern: /\b(salon|barbershop|pangkas rambut)/, category: 'service', iconType: 'salon' },
  { pattern: /\b(spa|pijat|massage|refleksi|timung)/, category: 'service', iconType: 'spa' },
  { pattern: /\b(penjahit|jahit|tailor)/, category: 'service', iconType: 'tailor' },
  { pattern: /\b(studio foto|fotografer|photography|photo studio|foto studio)/, category: 'service', iconType: 'photo' },
  { pattern: /\b(servis komputer|service komputer|servis hp|service hp|servis elektronik|warnet)/, category: 'service', iconType: 'computer' },
  { pattern: /\b(internet provider|penyedia internet|wifi)/, category: 'service', iconType: 'internet' },
  { pattern: /\b(tps\b|tempat pembuangan|bank sampah|pengolahan sampah)/, category: 'service', iconType: 'waste' },
  { pattern: /\b(percetakan|fotokopi|fotocopy|jasa)/, category: 'service', iconType: 'service' },
  { pattern: /\b(lapangan basket|basketball)/, category: 'sports', iconType: 'basketball' },
  { pattern: /\b(lapangan sepak ?bola|sepak ?bola|futsal|football)/, category: 'sports', iconType: 'football' },
  { pattern: /\b(stadion|stadium|gor\b)/, category: 'sports', iconType: 'stadium' },
  { pattern: /\b(gym|fitness|pusat kebugaran)/, category: 'sports', iconType: 'gym' },
  { pattern: /\b(kolam renang|waterpark|water park|swimming)/, category: 'sports', iconType: 'swimming' },
  { pattern: /\b(lapangan|tempat olahraga|sport center|sports?)/, category: 'sports', iconType: 'sports-field' },
  { pattern: /\b(pantai|beach)/, category: 'tourism', iconType: 'beach' },
  { pattern: /\b(museum)/, category: 'tourism', iconType: 'museum' },
  { pattern: /\b(monumen|tugu|landmark)/, category: 'tourism', iconType: 'landmark' },
  { pattern: /\b(bioskop|cinema|karaoke)/, category: 'tourism', iconType: 'entertainment' },
  { pattern: /\b(taman|park\b)/, category: 'tourism', iconType: 'park' },
  { pattern: /\b(tempat wisata|wisata|objek wisata|tourism)/, category: 'tourism', iconType: 'attraction' },
  { pattern: /\b(kontraktor|konstruksi|arsitek|penggergajian|toko bangunan)/, category: 'business', iconType: 'contractor' },
  { pattern: /\b(agen properti|properti|real estate)/, category: 'business', iconType: 'property' },
  { pattern: /\b(notaris|pengacara|kantor hukum|advokat)/, category: 'business', iconType: 'legal' },
  { pattern: /\b(akuntan|accounting)/, category: 'business', iconType: 'accounting' },
];

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('id-ID');
}

export function classifyPlace(name: string, explicitCategory = '', searchKeyword = ''): {
  category: PlaceCategory;
  iconType: PlaceIconType;
} {
  // The name is strongest evidence. Category and survey keyword are fallbacks only,
  // so a misleading collection keyword cannot override a recognizable place name.
  const matched = rules.find(rule => rule.pattern.test(normalized(name)));
  if (matched) return { category: matched.category, iconType: matched.iconType };

  const category = normalized(explicitCategory);
  if (!knownCategories.has(category)) {
    const categoryMatch = rules.find(rule => rule.pattern.test(category));
    if (categoryMatch) return { category: categoryMatch.category, iconType: categoryMatch.iconType };
  }

  const keywordMatch = rules.find(rule => rule.pattern.test(normalized(searchKeyword)));
  if (keywordMatch) return { category: keywordMatch.category, iconType: keywordMatch.iconType };

  const safeCategory = knownCategories.has(category) ? category as PlaceCategory : 'other';
  return { category: safeCategory, iconType: defaultIcons[safeCategory] };
}
