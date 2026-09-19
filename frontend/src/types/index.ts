export type LocationPoint = { lat: number; lng: number };
export type GeocodedPlace = LocationPoint & {
  id?: string;
  name: string;
  address: string;
  type?: string;
  source?: 'antarfix' | 'openstreetmap';
  verified?: boolean;
  distanceMeters?: number;
};
export type MapPlace = GeocodedPlace & { id: string; minZoom: number; labelPriority: number };
export type Selection = 'pickup' | 'destination';
export type UiState = 'idle' | 'selecting-pickup' | 'selecting-destination' | 'calculating' | 'success' | 'error';
export type PricingConfig = { baseFare: number; includedKm: number; pricePerKm: number; minimumFare: number };
export type ServiceLimits = { centerLat: number; centerLng: number; radiusKm: number; maxDistanceKm: number };
export type AppConfig = { pricing: PricingConfig; whatsappNumber: string; serviceArea: ServiceLimits };
export type Estimate = { distanceKm: number; durationMinutes: number; pricing: PricingConfig & { additionalKm: number; billableKm: number; distanceFare: number; total: number }; geometry: { type: 'LineString'; coordinates: [number, number][] } };
