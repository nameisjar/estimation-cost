import { classifyPlace } from '../services/places/place-classification.js';

type CoordinateRow = {
  latitude?: string;
  longitude?: string;
  googleMapsUrl?: string;
};

export type ResolvedPlaceCoordinates = {
  lat: number;
  lng: number;
  correction?: 'google-maps-url' | 'swapped';
};

export function normalizePlaceCategory(category: string, keyword: string, name: string): string {
  return classifyPlace(name, category, keyword).category;
}

export function optionalNumber(
  value: string | undefined,
  field: string,
  row: number,
): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Baris ${row}: ${field} bukan angka valid.`);
  }
  return parsed;
}

export function coordinatesFromMapsUrl(
  value: string | undefined,
): { lat: number; lng: number } | undefined {
  if (!value) return undefined;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // A malformed escape must not prevent matching coordinates in the original URL.
  }
  const match =
    decoded.match(/!3d(-?\d+(?:\.\d+)?).*?!4d(-?\d+(?:\.\d+)?)/) ??
    decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function coordinateNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function validCoordinates(lat: number | undefined, lng: number | undefined): lat is number {
  return lat !== undefined && lng !== undefined
    && lat >= -90 && lat <= 90
    && lng >= -180 && lng <= 180;
}

export function resolvePlaceCoordinates(
  record: CoordinateRow,
  row: number,
): ResolvedPlaceCoordinates {
  const lat = coordinateNumber(record.latitude);
  const lng = coordinateNumber(record.longitude);
  if (validCoordinates(lat, lng)) return { lat, lng: lng! };

  const fromUrl = coordinatesFromMapsUrl(record.googleMapsUrl);
  if (fromUrl && validCoordinates(fromUrl.lat, fromUrl.lng)) {
    return { ...fromUrl, correction: 'google-maps-url' };
  }

  if (validCoordinates(lng, lat)) {
    return { lat: lng, lng: lat!, correction: 'swapped' };
  }

  if (lat === undefined || lat < -90 || lat > 90) {
    throw new Error(`Baris ${row}: latitude wajib berupa angka -90 sampai 90.`);
  }
  throw new Error(`Baris ${row}: longitude wajib berupa angka -180 sampai 180.`);
}

export function requiredPlaceCoordinates(
  record: CoordinateRow,
  row: number,
): { lat: number; lng: number } {
  const { lat, lng } = resolvePlaceCoordinates(record, row);
  return { lat, lng };
}
