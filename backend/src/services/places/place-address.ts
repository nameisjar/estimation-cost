export type PlaceAddressSource = 'missing' | 'survey' | 'automatic' | 'manual';

export const missingAddress = 'Alamat belum tersedia';

export function isMissingAddress(value: string | null | undefined): boolean {
  const normalized = (value || '').trim();
  return !normalized || normalized.toLocaleLowerCase('id-ID') === missingAddress.toLocaleLowerCase('id-ID');
}

export function formatSearchArea(value: string | null | undefined): string {
  return (value || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part
      .toLocaleLowerCase('id-ID')
      .replace(/(^|[\s-])\p{L}/gu, letter => letter.toLocaleUpperCase('id-ID')))
    .join(', ');
}

export function displayPlaceAddress(
  address: string | null | undefined,
  searchArea: string | null | undefined,
): string {
  if (!isMissingAddress(address)) return address!.trim();
  return formatSearchArea(searchArea) || 'Sekitar Merauke, Papua Selatan';
}

export function addressSourceForInput(address: string | null | undefined): PlaceAddressSource {
  return isMissingAddress(address) ? 'missing' : 'manual';
}
