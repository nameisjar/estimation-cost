export type LocationPoint = { lat: number; lng: number };
export type GeocodedPlace = {
  id?: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  type?: string;
  source?: 'antarfix' | 'openstreetmap';
  verified?: boolean;
  distanceMeters?: number;
};
export type MapPlace = GeocodedPlace & { id: string; minZoom: number; labelPriority: number };
export type MapBounds = { north: number; south: number; east: number; west: number };
export type RouteGeometry = { type: 'LineString'; coordinates: [number, number][] };
export type RouteResult = { distanceKm: number; durationMinutes: number; geometry?: RouteGeometry };
export type PricingConfig = { baseFare: number; includedKm: number; pricePerKm: number; minimumFare: number };
export type PricingResult = PricingConfig & { additionalKm: number; billableKm: number; distanceFare: number; total: number };
export type ServiceLimits = {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  maxDistanceKm: number;
};
export type RateLimitConfig = { windowMs: number; maxRequests: number };
export interface RoutingProvider {
  route(pickup: LocationPoint, destination: LocationPoint, geometry?: boolean): Promise<RouteResult>;
}
export interface GeocodingProvider {
  reverse(point: LocationPoint): Promise<GeocodedPlace | null>;
  search(query: string, near?: LocationPoint): Promise<GeocodedPlace[]>;
}
export interface PlaceRepository {
  search(query: string, near?: LocationPoint, limit?: number): Promise<GeocodedPlace[]>;
  nearest(point: LocationPoint, radiusMeters?: number): Promise<GeocodedPlace | null>;
  inBounds(bounds: MapBounds, zoom: number, limit?: number): Promise<MapPlace[]>;
}
