type CoordinateRow = {
  latitude?: string;
  longitude?: string;
  googleMapsUrl?: string;
};

export function normalizePlaceCategory(category: string, keyword: string, name: string): string {
  const value = `${category} ${keyword} ${name}`.toLocaleLowerCase('id-ID');
  if (/rumah sakit|puskesmas|klinik|dokter|apotek|farmasi/.test(value)) return 'medical';
  if (/sekolah|universitas|kampus|akademi|perpustakaan|tk\b|paud\b|sd\b|smp\b|sma\b|smk\b/.test(value)) return 'education';
  if (/masjid|mushola|gereja|pura|vihara|tempat ibadah/.test(value)) return 'worship';
  if (/restoran|rumah makan|warung|bakso|kafe|cafe|bakery|roti|kuliner|makanan/.test(value)) return 'food';
  if (/hotel|homestay|guest house|penginapan|resort/.test(value)) return 'lodging';
  if (/bank|atm\b|koperasi|finance/.test(value)) return 'finance';
  if (/bengkel|spbu|rental mobil|otomotif|dealer/.test(value)) return 'automotive';
  if (/kantor pemerintah|kantor polisi|kantor pos|kelurahan|dinas\b|polres|polsek/.test(value)) return 'government';
  if (/pelabuhan|terminal|bandara|ekspedisi|logistik|transport/.test(value)) return 'transport';
  if (/pasar|toko|minimarket|supermarket|mall|butik|shop|elektronik|pakaian|bangunan/.test(value)) return 'retail';
  if (/salon|barbershop|laundry|percetakan|fotokopi|service/.test(value)) return 'service';
  return category.trim().toLocaleLowerCase('id-ID') || 'other';
}

export function optionalNumber(
  value: string | undefined,
  field: string,
  row: number,
): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Baris ${row}: ${field} bukan angka valid.`);
  }
  return parsed;
}

export function coordinatesFromMapsUrl(
  value: string | undefined,
): { lat: number; lng: number } | undefined {
  if (!value) return undefined;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // A malformed escape must not prevent matching coordinates in the original URL.
  }
  const match =
    decoded.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/) ??
    decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

export function requiredPlaceCoordinates(
  record: CoordinateRow,
  row: number,
): { lat: number; lng: number } {
  const fromUrl = coordinatesFromMapsUrl(record.googleMapsUrl);
  const lat = optionalNumber(record.latitude, 'latitude', row) ?? fromUrl?.lat;
  const lng = optionalNumber(record.longitude, 'longitude', row) ?? fromUrl?.lng;

  if (lat === undefined || lat < -90 || lat > 90) {
    throw new Error(`Baris ${row}: latitude wajib berupa angka -90 sampai 90.`);
  }
  if (lng === undefined || lng < -180 || lng > 180) {
    throw new Error(`Baris ${row}: longitude wajib berupa angka -180 sampai 180.`);
  }
  return { lat, lng };
}
