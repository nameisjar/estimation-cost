export type LocationPoint = { lat: number; lng: number };
export type GeocodedPlace = { name: string; address: string; lat: number; lng: number; type?: string };
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
