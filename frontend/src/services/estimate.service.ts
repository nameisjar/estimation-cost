import type { LocationPoint, Estimate, AppConfig, GeocodedPlace, MapPlace, BuildingFootprint } from '../types';
const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const buildingAtCache = new Map<string, {
  expiresAt: number;
  value: BuildingFootprint | null;
}>();
const localPlaceAtCache = new Map<string, {
  expiresAt: number;
  value: GeocodedPlace | null;
}>();
function pointCacheKey(point: LocationPoint, precision = 5) {
  return `${point.lat.toFixed(precision)},${point.lng.toFixed(precision)}`;
}
export function isValidPoint(point: LocationPoint | null): point is LocationPoint {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20000);
  const abort = () => controller.abort();
  options?.signal?.addEventListener('abort', abort, { once: true });
  if (options?.signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${baseUrl}${path}`, { ...options, signal: controller.signal });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error?.message || 'Perhitungan belum berhasil. Silakan coba lagi.');
    return body.data as T;
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) throw new Error('Server belum dapat dihubungi. Periksa koneksi lalu coba lagi.');
    if (error instanceof Error && error.name === 'AbortError' && timedOut) throw new Error('Perhitungan terlalu lama. Silakan coba lagi.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    options?.signal?.removeEventListener('abort', abort);
  }
}
export function getConfig() { return request<AppConfig>('/api/config'); }
export function reverseGeocode(point: LocationPoint, includeGeometry = false, signal?: AbortSignal) {
  const params = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) });
  if (includeGeometry) params.set('geometry', '1');
  return request<GeocodedPlace | null>(`/api/geocode/reverse?${params}`, { signal });
}
export async function getBuildingAt(point: LocationPoint, signal?: AbortSignal) {
  const cacheKey = pointCacheKey(point, 6);
  const cached = buildingAtCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) buildingAtCache.delete(cacheKey);
  const params = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) });
  const path = `/api/buildings/at?${params}`;
  try {
    const value = await request<BuildingFootprint | null>(path, { signal });
    if (!signal?.aborted) rememberPointResult(buildingAtCache, cacheKey, value);
    return value;
  } catch (error) {
    if (signal?.aborted) throw error;
    await new Promise(resolve => setTimeout(resolve, 250));
    const value = await request<BuildingFootprint | null>(path, { signal });
    if (!signal?.aborted) rememberPointResult(buildingAtCache, cacheKey, value);
    return value;
  }
}
export async function getLocalPlaceAt(point: LocationPoint, signal?: AbortSignal) {
  const cacheKey = pointCacheKey(point);
  const cached = localPlaceAtCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) localPlaceAtCache.delete(cacheKey);
  const params = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) });
  const value = await request<GeocodedPlace | null>(`/api/places/nearest?${params}`, { signal });
  if (!signal?.aborted) rememberPointResult(localPlaceAtCache, cacheKey, value);
  return value;
}

function rememberPointResult<T>(
  cache: Map<string, { expiresAt: number; value: T }>,
  key: string,
  value: T,
) {
  cache.set(key, { expiresAt: Date.now() + 120_000, value });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
}
export function searchPlaces(query: string, near?: LocationPoint | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query.trim() });
  const focus = near ?? null;
  if (isValidPoint(focus)) {
    params.set('lat', String(focus.lat));
    params.set('lng', String(focus.lng));
  }
  return request<GeocodedPlace[]>(`/api/geocode/search?${params}`, { signal });
}
export function suggestPlaces(query: string, near?: LocationPoint | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query.trim() });
  const focus = near ?? null;
  if (isValidPoint(focus)) {
    params.set('lat', String(focus.lat));
    params.set('lng', String(focus.lng));
  }
  return request<GeocodedPlace[]>(`/api/places/suggestions?${params}`, { signal });
}
export function getMapPlaces(bounds: { north: number; south: number; east: number; west: number }, zoom: number, limit = 100, signal?: AbortSignal) {
  const params = new URLSearchParams({
    north: String(bounds.north),
    south: String(bounds.south),
    east: String(bounds.east),
    west: String(bounds.west),
    zoom: String(Math.round(zoom)),
    limit: String(Math.min(Math.max(limit, 1), 200)),
  });
  return request<MapPlace[]>(`/api/places/map?${params}`, { signal });
}
export function estimateCost(pickup: LocationPoint, destination: LocationPoint) {
  if (!isValidPoint(pickup) || !isValidPoint(destination)) throw new Error('Pilih titik jemput dan tujuan yang valid.');
  return request<Estimate>('/api/estimate?geometry=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pickup, destination }) });
}
