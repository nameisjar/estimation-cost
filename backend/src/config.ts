import 'dotenv/config';
import type { RateLimitConfig, ServiceLimits } from './types/index.js';

function numeric(name: string, fallback: number, integer = false): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw new Error(`Invalid configuration: ${name}`);
  return value;
}
function boundedNumeric(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Invalid configuration: ${name}`);
  return value;
}
function httpUrl(name: string, fallback: string): string {
  const value = process.env[name] || fallback;
  const parsed = new URL(value);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error(`Invalid configuration: ${name}`);
  return value.replace(/\/$/, '');
}
export function normalizeWhatsAppNumber(value: string | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/[\s()+.-]/g, '');
  if (/^[1-9]\d{6,14}$/.test(normalized)) return normalized;
  console.warn('WHATSAPP_NUMBER tidak valid; pemesanan WhatsApp dinonaktifkan. Gunakan 7-15 digit internasional, misalnya 6281234567890.');
  return '';
}
const whatsappNumber = normalizeWhatsAppNumber(process.env.WHATSAPP_NUMBER);
const serviceLimits: ServiceLimits = {
  centerLat: boundedNumeric('SERVICE_AREA_CENTER_LAT', -8.4932, -90, 90),
  centerLng: boundedNumeric('SERVICE_AREA_CENTER_LNG', 140.4018, -180, 180),
  radiusKm: numeric('SERVICE_AREA_RADIUS_KM', 50),
  maxDistanceKm: numeric('MAX_DELIVERY_DISTANCE_KM', 50),
};
const rateLimit: RateLimitConfig = {
  windowMs: numeric('RATE_LIMIT_WINDOW_MS', 60000, true),
  maxRequests: numeric('RATE_LIMIT_MAX_REQUESTS', 60, true),
};
export const config = {
  port: numeric('PORT', 3000, true),
  osrmBaseUrl: httpUrl('OSRM_BASE_URL', 'https://router.project-osrm.org'),
  osrmTimeoutMs: numeric('OSRM_TIMEOUT_MS', 12000, true),
  geocodingBaseUrl: httpUrl('GEOCODING_BASE_URL', 'https://nominatim.openstreetmap.org'),
  geocodingTimeoutMs: numeric('GEOCODING_TIMEOUT_MS', 10000, true),
  geocodingUserAgent: (process.env.GEOCODING_USER_AGENT || 'AntarFixEstimator/1.0 (estimator.antarfix.id)').trim(),
  geocodingSearchRadiusKm: numeric('GEOCODING_SEARCH_RADIUS_KM', 20),
  frontendUrl: httpUrl('FRONTEND_URL', 'http://localhost:5173'),
  whatsappNumber,
  serviceLimits,
  rateLimit,
  pricing: { baseFare: numeric('BASE_FARE', 8000, true), includedKm: numeric('INCLUDED_KM', 2), pricePerKm: numeric('PRICE_PER_KM', 2500, true), minimumFare: numeric('MINIMUM_FARE', 8000, true) },
};
if (
  config.port < 1 || config.port > 65535 ||
  config.osrmTimeoutMs < 1 || config.geocodingTimeoutMs < 1 ||
  !config.geocodingUserAgent || serviceLimits.radiusKm <= 0 ||
  config.geocodingSearchRadiusKm <= 0 || config.geocodingSearchRadiusKm > serviceLimits.radiusKm ||
  serviceLimits.maxDistanceKm <= 0 || rateLimit.windowMs <= 0 || rateLimit.maxRequests <= 0
) throw new Error('Invalid port, timeout, service limit, rate limit, or geocoding user agent');
