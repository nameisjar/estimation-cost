import type { GeocodedPlace, Selection } from '../types';

const administrativeTypes = new Set([
  'administrative', 'city', 'town', 'village', 'municipality', 'county', 'state',
  'country', 'region', 'suburb', 'neighbourhood', 'quarter', 'hamlet', 'postcode',
  'island',
]);

const roadTypes = new Set([
  'road', 'residential', 'service', 'primary', 'secondary', 'tertiary',
  'unclassified', 'living_street', 'pedestrian', 'footway', 'path', 'track',
]);

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
