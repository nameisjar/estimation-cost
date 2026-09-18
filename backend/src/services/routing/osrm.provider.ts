import type { LocationPoint, RoutingProvider, RouteResult, RouteGeometry } from '../../types/index.js';
import { ApiError } from '../../errors.js';
export class OsrmProvider implements RoutingProvider {
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 12000, private readonly request: typeof fetch = fetch) {}
  async route(pickup: LocationPoint, destination: LocationPoint, geometry = false): Promise<RouteResult> {
    const coordinates = `${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}`;
    const url = new URL(`${this.baseUrl}/route/v1/driving/${coordinates}`);
    url.searchParams.set('overview', geometry ? 'full' : 'false');
    url.searchParams.set('alternatives', 'false');
    url.searchParams.set('radiuses', '1000;1000');
    if (geometry) url.searchParams.set('geometries', 'geojson');
    try {
      const response = await this.request(url, { signal: AbortSignal.timeout(this.timeoutMs) });
      let data: Record<string, unknown>;
      try { data = await response.json() as Record<string, unknown>; }
      catch { throw new ApiError(502, 'INVALID_ROUTING_RESPONSE', 'Layanan rute mengirim respons yang tidak valid. Silakan coba lagi.'); }
      if (data && ['NoRoute', 'NoSegment'].includes(String(data.code))) throw new ApiError(422, 'NO_ROUTE', 'Maaf, rute tidak dapat ditemukan. Pilih titik lain yang dekat dengan jalan.');
      if (!response.ok) throw new ApiError(502, 'ROUTING_HTTP_ERROR', 'Layanan rute sedang tidak tersedia. Silakan coba lagi.');
      const first = Array.isArray(data?.routes) ? data.routes[0] as Record<string, unknown> | undefined : undefined;
      if (data?.code !== 'Ok' || !first || typeof first.distance !== 'number' || !Number.isFinite(first.distance) || first.distance < 0 || typeof first.duration !== 'number' || !Number.isFinite(first.duration) || first.duration < 0) throw new ApiError(502, 'INVALID_ROUTING_RESPONSE', 'Data rute tidak valid. Silakan coba lagi.');
      let routeGeometry: RouteGeometry | undefined;
      if (geometry) {
        const candidate = first.geometry as RouteGeometry | undefined;
        if (candidate?.type !== 'LineString' || !Array.isArray(candidate.coordinates) || candidate.coordinates.length < 2 || !candidate.coordinates.every(point => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90)) throw new ApiError(502, 'INVALID_ROUTING_RESPONSE', 'Garis rute tidak tersedia. Silakan coba lagi.');
        routeGeometry = candidate;
      }
      return { distanceKm: first.distance / 1000, durationMinutes: first.duration / 60, ...(routeGeometry ? { geometry: routeGeometry } : {}) };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new ApiError(504, 'ROUTING_TIMEOUT', 'Perhitungan rute terlalu lama. Silakan coba lagi.');
      throw new ApiError(502, 'ROUTING_NETWORK_ERROR', 'Layanan rute tidak dapat dihubungi. Silakan coba lagi.');
    }
  }
}
