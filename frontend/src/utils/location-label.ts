import type { GeocodedPlace, LocationPoint, Selection } from '../types';

const administrativeTypes = new Set([
  'administrative', 'city', 'town', 'village', 'municipality', 'county', 'state',
  'country', 'region', 'suburb', 'neighbourhood', 'quarter', 'hamlet', 'postcode',
  'island',
]);

const roadTypes = new Set([
  'road', 'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  'unclassified', 'residential', 'living_street', 'service', 'pedestrian',
  'track', 'bus_guideway', 'escape', 'raceway', 'footway', 'bridleway',
  'steps', 'corridor', 'path', 'cycleway',
]);

export type LocationPrecision = 'exact' | 'road' | 'approximate';

function fallbackName(target: Selection): string {
  return target === 'pickup' ? 'Titik jemput pilihan' : 'Titik tujuan pilihan';
}

export function locationName(place: GeocodedPlace | null, target: Selection): string {
  if (!place) return fallbackName(target);
  const name = place.name.trim();
  const type = place.type?.toLocaleLowerCase('id') || '';
  if (!name || name.toLocaleLowerCase('id') === 'lokasi dipilih' || administrativeTypes.has(type)) {
    return fallbackName(target);
  }
  if (roadTypes.has(type)) return /^titik di\s/i.test(name) ? name : `Titik di ${name}`;
  return name;
}

export function locationWithFallback(place: GeocodedPlace | null, target: Selection): GeocodedPlace | null {
  return place ? { ...place, name: locationName(place, target) } : null;
}

export function locationPrecision(place: GeocodedPlace | null): LocationPrecision {
  if (!place) return 'approximate';
  if (place.geometry) return 'exact';
  const type = place.type?.toLocaleLowerCase('id') || '';
  if (roadTypes.has(type) || /^titik di\s/i.test(place.name)) return 'road';
  if (
    administrativeTypes.has(type)
    || /^titik (jemput|tujuan) (pilihan|di peta)$/i.test(place.name)
    || place.name.toLocaleLowerCase('id') === 'lokasi dipilih'
  ) return 'approximate';
  return 'exact';
}

function addressDetailScore(value?: string): number {
  if (!value?.trim()) return 0;
  const parts = value.split(',').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return 0;
  const coordinateOnly = /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/i.test(value.trim());
  return coordinateOnly ? 1 : parts.length * 10 + Math.min(value.trim().length, 100) / 100;
}

export function preferredLocationAddress(
  buildingAddress: string | null | undefined,
  geocodedAddress: string | null | undefined,
  fallback: string,
): string {
  const building = buildingAddress?.trim() || '';
  const geocoded = geocodedAddress?.trim() || '';
  return addressDetailScore(geocoded) > addressDetailScore(building)
    ? geocoded
    : building || geocoded || fallback;
}

export function unnamedBuildingLabel(address: string): string {
  const firstPart = address.split(',')[0]?.trim() || '';
  if (/^(jalan|jl\.?|gang|gg\.?|lorong)\b/i.test(firstPart)) return `Bangunan di ${firstPart}`;
  return 'Bangunan dipilih';
}

function distanceMeters(first: LocationPoint, second: LocationPoint): number {
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lng - first.lng);
  const firstLatitude = radians(first.lat);
  const secondLatitude = radians(second.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function locationWithMapFallback(
  point: LocationPoint,
  place: GeocodedPlace | null,
  target: Selection,
  maximumNameDistanceMeters = 10,
  maximumRoadNameDistanceMeters = 80,
): GeocodedPlace | null {
  const normalized = locationWithFallback(place, target);
  if (!normalized) return null;
  const measuredDistance = Number.isFinite(normalized.distanceMeters)
    ? normalized.distanceMeters!
    : distanceMeters(point, normalized);
  const type = normalized.type?.toLocaleLowerCase('id') || '';
  const acceptedDistance = roadTypes.has(type)
    ? maximumRoadNameDistanceMeters
    : maximumNameDistanceMeters;
  if (measuredDistance <= acceptedDistance) return normalized;
  return {
    ...normalized,
    name: target === 'pickup' ? 'Titik jemput di peta' : 'Titik tujuan di peta',
  };
}
