import type { LocationPoint } from '../types';
export function formatCurrency(value: number) { return `Rp${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)}`; }
export function formatDuration(value: number) {
  const minutes = Math.max(1, Math.ceil(value));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `±${hours} jam${remainder ? ` ${remainder} menit` : ''}` : `±${minutes} menit`;
}
export function formatDistance(value: number) { return `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value)} km`; }
export function formatPoint(point: LocationPoint) { return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`; }
export function whatsappUrl(number: string, pickup: LocationPoint, destination: LocationPoint, distance: number, total: number) {
  if (!/^[1-9]\d{6,14}$/.test(number)) return null;
  const message = `Halo AntarFix, saya ingin menggunakan layanan kurir.\n\n📍 Pickup:\n${formatPoint(pickup)}\n\n📍 Tujuan:\n${formatPoint(destination)}\n\n📏 Jarak: ${formatDistance(distance)}\n💰 Estimasi biaya: ${formatCurrency(total)}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
