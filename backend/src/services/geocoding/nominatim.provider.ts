import { ApiError } from '../../errors.js';
import type { GeocodedPlace, GeocodingProvider, LocationPoint, ServiceLimits } from '../../types/index.js';
import { directDistanceKm } from '../service-area/service-area.service.js';

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
type NominatimOptions = {
  minimumIntervalMs?: number;
  searchRadiusKm?: number;
  serviceLimits?: ServiceLimits;
};
type Bounds = { left: number; top: number; right: number; bottom: number };

function boundsAround(point: LocationPoint, radiusKm: number): Bounds {
  const latitudeDelta = radiusKm / 111.32;
  const longitudeScale = Math.max(0.1, Math.cos(point.lat * Math.PI / 180));
  const longitudeDelta = radiusKm / (111.32 * longitudeScale);
  return {
    left: point.lng - longitudeDelta,
    top: point.lat + latitudeDelta,
    right: point.lng + longitudeDelta,
    bottom: point.lat - latitudeDelta,
  };
}

function intersectBounds(first: Bounds, second: Bounds): Bounds {
  return {
    left: Math.max(first.left, second.left),
    top: Math.min(first.top, second.top),
    right: Math.min(first.right, second.right),
    bottom: Math.max(first.bottom, second.bottom),
  };
}

function formatBounds(bounds: Bounds): string {
  return [bounds.left, bounds.top, bounds.right, bounds.bottom]
    .map(value => value.toFixed(6))
    .join(',');
}

function normalizePlace(place: NominatimPlace): GeocodedPlace | null {
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const displayName = (place.display_name || '').trim();
  const addressName = place.address?.amenity || place.address?.shop || place.address?.tourism || place.address?.building;
  const name = (place.name || place.namedetails?.name || addressName || displayName.split(',')[0] || 'Lokasi dipilih').trim();
  const parts = displayName.split(',').map(part => part.trim()).filter(Boolean);
  if (parts[0]?.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0) parts.shift();
  return { name, address: parts.join(', ') || displayName || `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng, source: 'openstreetmap', ...(place.type ? { type: place.type } : {}) };
}

export class NominatimProvider implements GeocodingProvider {
  private queue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  private readonly cache = new Map<string, CacheEntry<GeocodedPlace | GeocodedPlace[] | null>>();
  private readonly minimumIntervalMs: number;
  private readonly searchRadiusKm: number;
  private readonly serviceLimits?: ServiceLimits;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly userAgent: string,
    private readonly referer: string,
    options: NominatimOptions = {},
  ) {
    this.minimumIntervalMs = options.minimumIntervalMs ?? 1000;
    this.searchRadiusKm = options.searchRadiusKm ?? 20;
    this.serviceLimits = options.serviceLimits;
  }

  private searchViewbox(near?: LocationPoint): string | null {
    if (!this.serviceLimits) return null;
    const serviceCenter = { lat: this.serviceLimits.centerLat, lng: this.serviceLimits.centerLng };
    const focus = near && directDistanceKm(serviceCenter, near) <= this.serviceLimits.radiusKm
      ? near
      : serviceCenter;
    const focusBounds = boundsAround(focus, this.searchRadiusKm);
    const serviceBounds = boundsAround(serviceCenter, this.serviceLimits.radiusKm);
    return formatBounds(intersectBounds(focusBounds, serviceBounds));
  }

  private serviceViewbox(): string | null {
    if (!this.serviceLimits) return null;
    return formatBounds(boundsAround(
      { lat: this.serviceLimits.centerLat, lng: this.serviceLimits.centerLng },
      this.serviceLimits.radiusKm,
    ));
  }

  private normalizeSearchResults(body: unknown): GeocodedPlace[] {
    if (!Array.isArray(body)) return [];
    const seen = new Set<string>();
    return body
      .map(item => normalizePlace(item as NominatimPlace))
      .filter((place): place is GeocodedPlace => {
        if (!place) return false;
        if (this.serviceLimits) {
          const center = { lat: this.serviceLimits.centerLat, lng: this.serviceLimits.centerLng };
          if (directDistanceKm(center, place) > this.serviceLimits.radiusKm) return false;
        }
        const key = `${place.lat.toFixed(5)},${place.lng.toFixed(5)},${place.name.toLocaleLowerCase('id')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }

  private async searchWithin(query: string, viewbox: string | null): Promise<GeocodedPlace[]> {
    const params = new URLSearchParams({ format: 'jsonv2', q: query.trim(), addressdetails: '1', namedetails: '1', countrycodes: 'id', limit: '8' });
    if (viewbox) {
      params.set('viewbox', viewbox);
      params.set('bounded', '1');
    }
    return this.normalizeSearchResults(await this.request(`/search?${params}`));
  }

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

  async search(query: string, near?: LocationPoint): Promise<GeocodedPlace[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase('id');
    const viewbox = this.searchViewbox(near);
    const fallbackViewbox = this.serviceViewbox();
    const key = `search:${normalizedQuery}:${viewbox || 'indonesia'}:${fallbackViewbox || 'none'}`;
    const cached = this.cached<GeocodedPlace[]>(key);
    if (cached !== undefined) return cached;
    let results = await this.searchWithin(query, viewbox);
    if (!results.length && fallbackViewbox && fallbackViewbox !== viewbox)
      results = await this.searchWithin(query, fallbackViewbox);
    return this.remember(key, results, 10 * 60 * 1000);
  }
}
