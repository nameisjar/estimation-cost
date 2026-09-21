import type { GeocodedPlace, LocationPoint } from '../types';
export function formatCurrency(value: number) { return `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)}`; }
export function formatDuration(value: number) {
  const minutes = Math.max(1, Math.ceil(value));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `±${hours} jam${remainder ? ` ${remainder} menit` : ''}` : `±${minutes} menit`;
}
export function formatDistance(value: number) { return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value)} km`; }
export function formatPoint(point: LocationPoint) { return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`; }

type WhatsAppEstimate = {
  pickup: LocationPoint;
  destination: LocationPoint;
  pickupPlace?: GeocodedPlace | null;
  destinationPlace?: GeocodedPlace | null;
  distanceKm: number;
  durationMinutes: number;
  total: number;
};

function locationMessage(label: string, point: LocationPoint, place?: GeocodedPlace | null): string {
  const details = [
    `*${label}*`,
    place?.name,
    place?.address && place.address !== place.name ? place.address : undefined,
    `Koordinat: ${formatPoint(point)}`,
    `Peta: https://www.google.com/maps?q=${point.lat},${point.lng}`,
  ].filter((line): line is string => !!line);
  return details.join('\n');
}

export function whatsappUrl(number: string, details: WhatsAppEstimate) {
  if (!/^[1-9]\d{6,14}$/.test(number)) return null;
  const message = [
    'Halo AntarFix,',
    'Saya ingin memesan layanan kurir.',
    '',
    '*DETAIL PENGIRIMAN*',
    locationMessage('LOKASI JEMPUT', details.pickup, details.pickupPlace),
    '',
    locationMessage('TUJUAN', details.destination, details.destinationPlace),
    '',
    '*ESTIMASI PERJALANAN*',
    `Jarak: ${formatDistance(details.distanceKm)}`,
    `Waktu tempuh: sekitar ${Math.max(1, Math.ceil(details.durationMinutes))} menit`,
    `Biaya: *${formatCurrency(details.total)}*`,
    '',
    'Mohon konfirmasi ketersediaan kurir dan biaya akhirnya. Terima kasih.',
  ].join('\n');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
