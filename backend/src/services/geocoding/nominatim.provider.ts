import { ApiError } from '../../errors.js';
import type { GeocodedPlace, GeocodingProvider, LocationPoint, PlaceAreaGeometry, ServiceLimits } from '../../types/index.js';
import { directDistanceKm } from '../service-area/service-area.service.js';

type NominatimPlace = {
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  type?: string;
  namedetails?: Record<string, string>;
  address?: Record<string, string>;
  geojson?: { type?: string; coordinates?: unknown };
};

type CacheEntry<T> = { expiresAt: number; value: T };
type NominatimOptions = {
  minimumIntervalMs?: number;
  searchRadiusKm?: number;
  serviceLimits?: ServiceLimits;
};
type Bounds = { left: number; top: number; right: number; bottom: number };

const roadTypes = new Set([
  'road', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  'unclassified', 'residential', 'living_street', 'service', 'pedestrian',
  'track', 'bus_guideway', 'escape', 'raceway', 'footway', 'bridleway',
  'steps', 'corridor', 'path', 'cycleway',
]);

const administrativeAddressParts = [
  'city', 'town', 'village', 'municipality', 'county', 'state', 'region', 'city_district', 'district',
  'suburb', 'neighbourhood', 'quarter', 'hamlet', 'postcode', 'country',
] as const;

function cleanAddressPart(value?: string): string {
  return (value || '').trim().replace(/\s+/g, ' ');
}

function districtName(value?: string): string {
  const name = cleanAddressPart(value);
  if (!name) return '';
  if (/^(distrik|kecamatan)\b/i.test(name)) return name;
  return `Distrik ${name}`;
}

function countyName(value?: string): string {
  const name = cleanAddressPart(value);
  if (!name) return '';
  if (/^(kabupaten|kab\.?|kota)\b/i.test(name)) return name;
  const regency = name.match(/^(.+?)\s+regency$/i);
  return regency ? `Kabupaten ${regency[1]}` : `Kabupaten ${name}`;
}

function administrativeBase(value: string): string {
  return value
    .toLocaleLowerCase('id-ID')
    .replace(/^(kabupaten|kab\.?|kota|regency)\s+/i, '')
    .replace(/\s+regency$/i, '')
    .trim();
}

function pushUnique(parts: string[], value?: string): void {
  const cleaned = cleanAddressPart(value);
  if (!cleaned) return;
  const key = cleaned.toLocaleLowerCase('id-ID');
  if (!parts.some(part => part.toLocaleLowerCase('id-ID') === key)) parts.push(cleaned);
}

function structuredAddress(address?: Record<string, string>): string {
  if (!address) return '';
  const parts: string[] = [];
  const road = cleanAddressPart(address.road || address.pedestrian || address.footway || address.path);
  const houseNumber = cleanAddressPart(address.house_number);
  pushUnique(parts, houseNumber && road && !road.includes(houseNumber) ? `${road} ${houseNumber}` : road || houseNumber);
  pushUnique(parts, address.neighbourhood);
  pushUnique(parts, address.quarter);
  pushUnique(parts, address.suburb);
  pushUnique(parts, address.hamlet);
  pushUnique(parts, address.village);
  pushUnique(parts, address.town);
  const district = districtName(address.city_district || address.district);
  pushUnique(parts, district);
  const city = cleanAddressPart(address.city);
  const county = countyName(address.county || address.municipality);
  if (
    (!district || administrativeBase(city) !== administrativeBase(district))
    && (!county || administrativeBase(city) !== administrativeBase(county))
  ) pushUnique(parts, city);
  pushUnique(parts, county);
  const province = cleanAddressPart(address.state || address.region);
  const postcode = cleanAddressPart(address.postcode);
  pushUnique(parts, province && postcode ? `${province} ${postcode}` : province || postcode);
  return parts.join(', ');
}

function fallbackDisplayAddress(displayName: string, featureName: string, country?: string): string {
  const parts = displayName.split(',').map(part => part.trim()).filter(Boolean);
  if (parts[0]?.localeCompare(featureName, undefined, { sensitivity: 'accent' }) === 0) parts.shift();
  const countryNames = new Set(['indonesia', cleanAddressPart(country).toLocaleLowerCase('id-ID')].filter(Boolean));
  return parts
    .filter(part => !countryNames.has(part.toLocaleLowerCase('id-ID')))
    .filter((part, index, values) => values.findIndex(value => value.localeCompare(part, undefined, { sensitivity: 'accent' }) === 0) === index)
    .join(', ');
}

function sameName(first: string, second?: string): boolean {
  return !!second && first.localeCompare(second.trim(), undefined, { sensitivity: 'accent' }) === 0;
}

function isAdministrativeName(name: string, address?: Record<string, string>): boolean {
  return administrativeAddressParts.some(part => sameName(name, address?.[part]));
}

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

function normalizeRing(value: unknown, coordinateCount: { value: number }): [number, number][] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const ring: [number, number][] = [];
  for (const position of value) {
    if (!Array.isArray(position) || position.length < 2) return null;
    const lng = Number(position[0]);
    const lat = Number(position[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    coordinateCount.value++;
    if (coordinateCount.value > 4_000) return null;
    ring.push([lng, lat]);
  }
  return ring;
}

function normalizePolygon(value: unknown, coordinateCount: { value: number }): [number, number][][] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const polygon: [number, number][][] = [];
  for (const ringValue of value) {
    const ring = normalizeRing(ringValue, coordinateCount);
    if (!ring) return null;
    polygon.push(ring);
  }
  return polygon;
}

function normalizeAreaGeometry(value: NominatimPlace['geojson']): PlaceAreaGeometry | undefined {
  if (!value?.coordinates) return undefined;
  const coordinateCount = { value: 0 };
  if (value.type === 'Polygon') {
    const coordinates = normalizePolygon(value.coordinates, coordinateCount);
    return coordinates ? { type: 'Polygon', coordinates } : undefined;
  }
  if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates)) {
    const coordinates: [number, number][][][] = [];
    for (const polygonValue of value.coordinates) {
      const polygon = normalizePolygon(polygonValue, coordinateCount);
      if (!polygon) return undefined;
      coordinates.push(polygon);
    }
    return coordinates.length ? { type: 'MultiPolygon', coordinates } : undefined;
  }
  return undefined;
}

function normalizePlace(place: NominatimPlace): GeocodedPlace | null {
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const displayName = (place.display_name || '').trim();
  const addressName = place.address?.amenity || place.address?.shop || place.address?.tourism || place.address?.building;
  const featureName = (place.name || place.namedetails?.name || addressName || displayName.split(',')[0] || '').trim();
  const roadName = (place.address?.road || place.address?.pedestrian || place.address?.footway || place.address?.path || '').trim();
  const sourceType = place.type?.toLocaleLowerCase('id') || '';
  const useRoadName = !!roadName && (
    !featureName || roadTypes.has(sourceType) || isAdministrativeName(featureName, place.address)
  );
  const name = (useRoadName ? roadName : featureName) || 'Lokasi dipilih';
  const normalizedType = useRoadName && !roadTypes.has(sourceType) ? 'road' : place.type;
  const address = structuredAddress(place.address)
    || fallbackDisplayAddress(displayName, name, place.address?.country)
    || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  const geometry = normalizeAreaGeometry(place.geojson);
  return {
    name,
    address,
    lat,
    lng,
    source: 'openstreetmap',
    ...(normalizedType ? { type: normalizedType } : {}),
    ...(geometry ? { geometry } : {}),
  };
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

  async reverse(point: LocationPoint, options: { includeGeometry?: boolean } = {}): Promise<GeocodedPlace | null> {
    const geometryKey = options.includeGeometry ? ':geometry' : '';
    const key = `reverse${geometryKey}:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    const cached = this.cached<GeocodedPlace | null>(key);
    if (cached !== undefined) return cached;
    const params = new URLSearchParams({ format: 'jsonv2', lat: String(point.lat), lon: String(point.lng), addressdetails: '1', namedetails: '1', zoom: '18' });
    if (options.includeGeometry) {
      params.set('polygon_geojson', '1');
      params.set('polygon_threshold', '0.00001');
    }
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
