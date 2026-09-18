import { Router } from 'express';
import { ApiError } from '../errors.js';
import type { GeocodingProvider } from '../types/index.js';
import { validatePoint } from '../validation.js';

export function geocodingRoutes(provider: GeocodingProvider) {
  const router = Router();

  router.get('/geocode/reverse', async (req, res, next) => {
    try {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const point = validatePoint({ lat, lng }, 'lokasi');
      res.json({ success: true, data: await provider.reverse(point) });
    } catch (error) { next(error); }
  });

  router.get('/geocode/search', async (req, res, next) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (query.length < 3 || query.length > 120) throw new ApiError(400, 'INVALID_SEARCH_QUERY', 'Masukkan minimal 3 dan maksimal 120 karakter.');
      const hasLat = req.query.lat !== undefined;
      const hasLng = req.query.lng !== undefined;
      if (hasLat !== hasLng) throw new ApiError(400, 'INVALID_SEARCH_FOCUS', 'Fokus pencarian harus memiliki lat dan lng.');
      const near = hasLat && hasLng
        ? validatePoint({ lat: Number(req.query.lat), lng: Number(req.query.lng) }, 'fokus pencarian')
        : undefined;
      res.json({ success: true, data: await provider.search(query, near) });
    } catch (error) { next(error); }
  });

  return router;
}
