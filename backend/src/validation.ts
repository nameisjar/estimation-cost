import type { LocationPoint } from './types/index.js';
import { ApiError } from './errors.js';
export function validatePoint(value: unknown, name: string): LocationPoint {
  if (!value || typeof value !== 'object') throw new ApiError(400, 'INVALID_COORDINATES', `${name} harus berisi lat dan lng.`);
  const { lat, lng } = value as Record<string, unknown>;
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) throw new ApiError(400, 'INVALID_COORDINATES', `${name}.lat harus berupa angka antara -90 dan 90.`);
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new ApiError(400, 'INVALID_COORDINATES', `${name}.lng harus berupa angka antara -180 dan 180.`);
  return { lat, lng };
}
