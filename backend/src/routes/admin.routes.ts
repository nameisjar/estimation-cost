import { Router, text as parseTextBody, type RequestHandler } from 'express';
import { ApiError } from '../errors.js';
import { config } from '../config.js';
import { validatePoint } from '../validation.js';
import { directDistanceKm } from '../services/service-area/service-area.service.js';
import { AdminAuthService } from '../services/admin/admin-auth.service.js';
import { AdminPlaceRepository, type AdminPlaceInput } from '../services/places/admin-place.repository.js';
import type { GeocodingProvider } from '../types/index.js';
import { placeCategories, placeIconTypes } from '../services/places/place-classification.js';
import {
  PlaceCsvImportService,
  type PlaceCsvImportMode,
  type SurveyPlaceImportRepository,
} from '../services/places/place-csv-import.service.js';

const categories = new Set<string>(placeCategories);
const iconTypes = new Set<string>(placeIconTypes);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, name: string, maximum: number, required = false): string {
  if (value == null) {
    if (required) throw new ApiError(400, 'INVALID_ADMIN_PLACE', `${name} wajib diisi.`);
    return '';
  }
  if (typeof value !== 'string') throw new ApiError(400, 'INVALID_ADMIN_PLACE', `${name} harus berupa teks.`);
  const normalized = value.trim();
  if (required && !normalized) throw new ApiError(400, 'INVALID_ADMIN_PLACE', `${name} wajib diisi.`);
  if (normalized.length > maximum) throw new ApiError(400, 'INVALID_ADMIN_PLACE', `${name} maksimal ${maximum} karakter.`);
  return normalized;
}

function optionalNumber(value: unknown, name: string, minimum: number, maximum: number, integer = false): number | undefined {
  if (value === '' || value == null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new ApiError(400, 'INVALID_ADMIN_PLACE', `${name} tidak valid.`);
  }
  return value;
}

function optionalUrl(value: unknown, name: string): string {
  const normalized = text(value, name, 1000);
  if (!normalized) return '';
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch { throw new ApiError(400, 'INVALID_ADMIN_PLACE', `${name} harus berupa URL http/https yang valid.`); }
  return normalized;
}

function parsePlaceBody(body: unknown): AdminPlaceInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_ADMIN_PLACE', 'Data tempat tidak valid.');
  const value = body as Record<string, unknown>;
  const name = text(value.name, 'Nama tempat', 160, true);
  const category = text(value.category, 'Kategori', 40, true).toLowerCase();
  if (!categories.has(category)) throw new ApiError(400, 'INVALID_ADMIN_PLACE', 'Kategori tempat tidak dikenal.');
  const iconType = text(value.iconType, 'Jenis ikon', 40, true).toLowerCase();
  if (!iconTypes.has(iconType)) throw new ApiError(400, 'INVALID_ADMIN_PLACE', 'Jenis ikon tempat tidak dikenal.');
  const point = validatePoint({ lat: value.lat, lng: value.lng }, 'lokasi tempat');
  const center = { lat: config.serviceLimits.centerLat, lng: config.serviceLimits.centerLng };
  if (directDistanceKm(center, point) > config.serviceLimits.radiusKm) {
    throw new ApiError(422, 'OUTSIDE_SERVICE_AREA', `Tempat berada di luar radius layanan ${config.serviceLimits.radiusKm} km.`);
  }
  return {
    name,
    category,
    iconType,
    address: text(value.address, 'Alamat', 500) || 'Alamat belum tersedia',
    lat: point.lat,
    lng: point.lng,
    rating: optionalNumber(value.rating, 'Rating', 0, 5),
    reviewCount: optionalNumber(value.reviewCount, 'Jumlah ulasan', 0, 10_000_000, true),
    phone: text(value.phone, 'Telepon', 40),
    website: optionalUrl(value.website, 'Website'),
    openingHours: text(value.openingHours, 'Jam operasional', 500),
    googleMapsUrl: optionalUrl(value.googleMapsUrl, 'Google Maps URL'),
    searchKeyword: text(value.searchKeyword, 'Kata kunci', 160),
    searchArea: text(value.searchArea, 'Area pencarian', 160),
    active: value.active === undefined ? true : value.active === true,
  };
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  const parsed = typeof value === 'string' ? Number(value) : fallback;
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, maximum) : fallback;
}

export function adminRoutes(
  repository: AdminPlaceRepository | undefined,
  auth: AdminAuthService,
  addressGeocoder: GeocodingProvider,
  surveyImportRepository?: SurveyPlaceImportRepository,
) {
  const router = Router();
  const production = process.env.NODE_ENV === 'production';
  const csvImporter = surveyImportRepository
    ? new PlaceCsvImportService(surveyImportRepository, config.serviceLimits)
    : undefined;

  const available: RequestHandler = (_req, _res, next) => {
    if (!auth.enabled) { next(new ApiError(503, 'ADMIN_NOT_CONFIGURED', 'Akun admin belum dikonfigurasi.')); return; }
    if (!repository) { next(new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Database admin belum dikonfigurasi.')); return; }
    next();
  };
  const authenticated: RequestHandler = (req, _res, next) => {
    if (!auth.readSession(req.headers.cookie)) { next(new ApiError(401, 'ADMIN_UNAUTHORIZED', 'Sesi admin tidak valid atau sudah berakhir.')); return; }
    next();
  };
  const csrf: RequestHandler = (req, _res, next) => {
    if (req.get('x-antarfix-admin') !== '1') { next(new ApiError(403, 'ADMIN_CSRF_REJECTED', 'Permintaan admin tidak valid.')); return; }
    next();
  };

  router.post('/admin/login', available, (req, res, next) => {
    try {
      const username = text(req.body?.username, 'Username', 100, true);
      const password = text(req.body?.password, 'Password', 300, true);
      if (!auth.verifyCredentials(username, password)) throw new ApiError(401, 'INVALID_ADMIN_CREDENTIALS', 'Username atau password salah.');
      res.setHeader('Set-Cookie', auth.sessionCookie(auth.createToken(), production));
      res.json({ success: true, data: { username } });
    } catch (error) { next(error); }
  });

  router.post('/admin/logout', available, csrf, (_req, res) => {
    res.setHeader('Set-Cookie', auth.clearCookie(production));
    res.json({ success: true, data: null });
  });

  router.get('/admin/session', available, authenticated, (_req, res) => {
    res.json({ success: true, data: { username: config.admin.username } });
  });

  router.post('/admin/address/reverse', available, authenticated, csrf, async (req, res, next) => {
    try {
      const point = validatePoint({ lat: req.body?.lat, lng: req.body?.lng }, 'lokasi tempat');
      const center = { lat: config.serviceLimits.centerLat, lng: config.serviceLimits.centerLng };
      if (directDistanceKm(center, point) > config.serviceLimits.radiusKm) {
        throw new ApiError(422, 'OUTSIDE_SERVICE_AREA', `Tempat berada di luar radius layanan ${config.serviceLimits.radiusKm} km.`);
      }
      const place = await addressGeocoder.reverse(point);
      if (!place?.address) throw new ApiError(404, 'ADDRESS_NOT_FOUND', 'Alamat belum ditemukan untuk koordinat ini.');
      res.json({ success: true, data: { address: place.address, name: place.name } });
    } catch (error) { next(error); }
  });

  router.use('/admin/places', available, authenticated);
  router.use('/admin/stats', available, authenticated);

  router.get('/admin/stats', async (_req, res, next) => {
    try { res.json({ success: true, data: await repository!.stats() }); } catch (error) { next(error); }
  });

  router.get('/admin/places', async (req, res, next) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
      const status = ['active', 'inactive'].includes(String(req.query.status)) ? String(req.query.status) as 'active' | 'inactive' : 'all';
      const addressStatus = ['missing', 'automatic', 'verified', 'survey'].includes(String(req.query.addressStatus))
        ? String(req.query.addressStatus) as 'missing' | 'automatic' | 'verified' | 'survey'
        : 'all';
      const page = positiveInteger(req.query.page, 1, 100_000);
      const limit = positiveInteger(req.query.limit, 20, 100);
      res.json({ success: true, data: await repository!.list(query, status, addressStatus, page, limit) });
    } catch (error) { next(error); }
  });

  const csvBody = parseTextBody({ type: ['text/csv', 'text/plain'], limit: Number.MAX_SAFE_INTEGER });
  const importMode = (value: unknown): PlaceCsvImportMode => value === 'insert-only' ? 'insert-only' : 'upsert';

  router.post('/admin/places/import/preview', csrf, csvBody, async (req, res, next) => {
    try {
      if (!csvImporter) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Database import belum dikonfigurasi.');
      if (typeof req.body !== 'string') throw new ApiError(415, 'INVALID_CSV_CONTENT_TYPE', 'File harus dikirim sebagai text/csv.');
      res.json({ success: true, data: await csvImporter.preview(req.body, importMode(req.query.mode)) });
    } catch (error) { next(error); }
  });

  router.post('/admin/places/import/commit', csrf, csvBody, async (req, res, next) => {
    try {
      if (!csvImporter) throw new ApiError(503, 'DATABASE_NOT_CONFIGURED', 'Database import belum dikonfigurasi.');
      if (typeof req.body !== 'string') throw new ApiError(415, 'INVALID_CSV_CONTENT_TYPE', 'File harus dikirim sebagai text/csv.');
      res.json({ success: true, data: await csvImporter.commit(req.body, importMode(req.query.mode)) });
    } catch (error) { next(error); }
  });

  router.post('/admin/places', csrf, async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await repository!.create(parsePlaceBody(req.body)) }); } catch (error) { next(error); }
  });

  router.put('/admin/places/:id', csrf, async (req, res, next) => {
    try {
      const id = String(req.params.id);
      if (!uuidPattern.test(id)) throw new ApiError(400, 'INVALID_PLACE_ID', 'ID tempat tidak valid.');
      res.json({ success: true, data: await repository!.update(id, parsePlaceBody(req.body)) });
    } catch (error) { next(error); }
  });

  router.patch('/admin/places/:id/status', csrf, async (req, res, next) => {
    try {
      const id = String(req.params.id);
      if (!uuidPattern.test(id)) throw new ApiError(400, 'INVALID_PLACE_ID', 'ID tempat tidak valid.');
      if (typeof req.body?.active !== 'boolean') throw new ApiError(400, 'INVALID_PLACE_STATUS', 'Status tempat tidak valid.');
      res.json({ success: true, data: await repository!.setActive(id, req.body.active) });
    } catch (error) { next(error); }
  });

  router.post('/admin/places/:id/enrich-address', csrf, async (req, res, next) => {
    try {
      const id = String(req.params.id);
      if (!uuidPattern.test(id)) throw new ApiError(400, 'INVALID_PLACE_ID', 'ID tempat tidak valid.');
      const place = await repository!.find(id);
      if (!place) throw new ApiError(404, 'PLACE_NOT_FOUND', 'Tempat tidak ditemukan.');
      const result = await addressGeocoder.reverse({ lat: place.lat, lng: place.lng });
      if (!result?.address) throw new ApiError(404, 'ADDRESS_NOT_FOUND', 'Alamat belum ditemukan untuk koordinat tempat ini.');
      res.json({ success: true, data: await repository!.saveAutomaticAddress(id, result.address) });
    } catch (error) { next(error); }
  });

  return router;
}
