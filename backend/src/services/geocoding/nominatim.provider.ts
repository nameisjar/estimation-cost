import { ApiError } from '../../errors.js';
import type { GeocodedPlace, GeocodingProvider, LocationPoint } from '../../types/index.js';

type NominatimPlace = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  type?: string;
  namedetails?: Record<string, string>;
  address?: Record<string, string>;
};

type CacheEntry<T> = { expiresAt: number; value: T };

function normalizePlace(place: NominatimPlace): GeocodedPlace | null {
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const displayName = (place.display_name || '').trim();
  const addressName = place.address?.amenity || place.address?.shop || place.address?.tourism || place.address?.building;
  const name = (place.name || place.namedetails?.name || addressName || displayName.split(',')[0] || 'Lokasi dipilih').trim();
  const parts = displayName.split(',').map(part => part.trim()).filter(Boolean);
  if (parts[0]?.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0) parts.shift();
  return { name, address: parts.join(', ') || displayName || `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng, ...(place.type ? { type: place.type } : {}) };
}

export class NominatimProvider implements GeocodingProvider {
  private queue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  private readonly cache = new Map<string, CacheEntry<GeocodedPlace | GeocodedPlace[] | null>>();

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly userAgent: string,
    private readonly referer: string,
    private readonly minimumIntervalMs = 1000,
  ) {}

  private cached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) { this.cache.delete(key); return undefined; }
    return entry.value as T;
  }

  private remember<T extends GeocodedPlace | GeocodedPlace[] | null>(key: string, value: T, ttlMs: number): T {
    if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  private async request(path: string): Promise<unknown> {
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      const waitMs = Math.max(0, this.nextRequestAt - Date.now());
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
      this.nextRequestAt = Date.now() + this.minimumIntervalMs;
      const response = await fetch(`${this.baseUrl}${path}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { Accept: 'application/json', 'Accept-Language': 'id', 'User-Agent': this.userAgent, Referer: this.referer },
      });
      if (!response.ok) throw new ApiError(502, 'GEOCODING_UPSTREAM_ERROR', 'Layanan pencarian lokasi sedang tidak tersedia. Coba lagi.');
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new ApiError(504, 'GEOCODING_TIMEOUT', 'Pencarian lokasi terlalu lama. Coba lagi.');
      throw new ApiError(502, 'GEOCODING_UNAVAILABLE', 'Nama lokasi belum dapat dimuat. Koordinat tetap bisa digunakan.');
    } finally { release(); }
  }

  async reverse(point: LocationPoint): Promise<GeocodedPlace | null> {
    const key = `reverse:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    const cached = this.cached<GeocodedPlace | null>(key);
    if (cached !== undefined) return cached;
    const params = new URLSearchParams({ format: 'jsonv2', lat: String(point.lat), lon: String(point.lng), addressdetails: '1', namedetails: '1', zoom: '18' });
    const result = normalizePlace(await this.request(`/reverse?${params}`) as NominatimPlace);
    return this.remember(key, result, 24 * 60 * 60 * 1000);
  }

  async search(query: string): Promise<GeocodedPlace[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase('id');
    const key = `search:${normalizedQuery}`;
    const cached = this.cached<GeocodedPlace[]>(key);
    if (cached !== undefined) return cached;
    const params = new URLSearchParams({ format: 'jsonv2', q: query.trim(), addressdetails: '1', namedetails: '1', countrycodes: 'id', limit: '5' });
    const body = await this.request(`/search?${params}`);
    const results = Array.isArray(body) ? body.map(item => normalizePlace(item as NominatimPlace)).filter((place): place is GeocodedPlace => !!place) : [];
    return this.remember(key, results, 10 * 60 * 1000);
  }
}
