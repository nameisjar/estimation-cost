import { ApiError } from '../../errors.js';
import type { LocationPoint, ServiceLimits } from '../../types/index.js';

const EARTH_RADIUS_KM = 6371;

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

export function directDistanceKm(from: LocationPoint, to: LocationPoint): number {
  const latitudeDelta = degreesToRadians(to.lat - from.lat);
  const longitudeDelta = degreesToRadians(to.lng - from.lng);
  const fromLatitude = degreesToRadians(from.lat);
  const toLatitude = degreesToRadians(to.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export class ServiceAreaService {
  constructor(private readonly limits: ServiceLimits) {}

  assertPointAllowed(point: LocationPoint, label: 'Titik jemput' | 'Titik tujuan'): void {
    const center = { lat: this.limits.centerLat, lng: this.limits.centerLng };
    if (directDistanceKm(center, point) > this.limits.radiusKm) {
      throw new ApiError(
        422,
        'OUTSIDE_SERVICE_AREA',
        `${label} berada di luar area layanan AntarFix sejauh ${this.limits.radiusKm} km dari pusat layanan.`,
      );
    }
  }

  assertRouteAllowed(distanceKm: number): void {
    if (distanceKm > this.limits.maxDistanceKm) {
      throw new ApiError(
        422,
        'DELIVERY_DISTANCE_EXCEEDED',
        `Jarak perjalanan melebihi batas layanan ${this.limits.maxDistanceKm} km.`,
      );
    }
  }
}
