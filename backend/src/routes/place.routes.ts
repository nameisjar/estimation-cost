import { Router } from 'express';
import { ApiError } from '../errors.js';
import type { MapBounds, PlaceRepository } from '../types/index.js';
import { validatePoint } from '../validation.js';

function finiteQuery(value: unknown, name: string): number {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new ApiError(400, 'INVALID_MAP_BOUNDS', `${name} harus berupa angka.`);
  return parsed;
}

export function placeRoutes(repository?: PlaceRepository) {
  const router = Router();

  router.get('/places/suggestions', async (req, res, next) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (query.length < 2 || query.length > 120) {
        throw new ApiError(400, 'INVALID_SUGGESTION_QUERY', 'Masukkan minimal 2 dan maksimal 120 karakter.');
      }
      const hasLat = req.query.lat !== undefined;
      const hasLng = req.query.lng !== undefined;
      if (hasLat !== hasLng) throw new ApiError(400, 'INVALID_SEARCH_FOCUS', 'Fokus pencarian harus memiliki lat dan lng.');
      const near = hasLat && hasLng
        ? validatePoint({ lat: Number(req.query.lat), lng: Number(req.query.lng) }, 'fokus pencarian')
        : undefined;
      res.json({ success: true, data: repository ? await repository.search(query, near, 6) : [] });
    } catch (error) { next(error); }
  });

  router.get('/places/nearest', async (req, res, next) => {
    try {
      const point = validatePoint(
        { lat: Number(req.query.lat), lng: Number(req.query.lng) },
        'lokasi terdekat',
      );
      res.json({ success: true, data: repository ? await repository.nearest(point) : null });
    } catch (error) { next(error); }
  });

  router.get('/places/map', async (req, res, next) => {
    try {
      if (!repository) {
        res.json({ success: true, data: [] });
        return;
      }
      const bounds: MapBounds = {
        north: finiteQuery(req.query.north, 'north'),
        south: finiteQuery(req.query.south, 'south'),
        east: finiteQuery(req.query.east, 'east'),
        west: finiteQuery(req.query.west, 'west'),
      };
      const zoom = finiteQuery(req.query.zoom, 'zoom');
      const limit = req.query.limit === undefined ? 100 : finiteQuery(req.query.limit, 'limit');
      if (
        bounds.north < -90 || bounds.north > 90 || bounds.south < -90 || bounds.south > 90 ||
        bounds.east < -180 || bounds.east > 180 || bounds.west < -180 || bounds.west > 180 ||
        bounds.north <= bounds.south || bounds.east <= bounds.west ||
        !Number.isInteger(zoom) || zoom < 0 || zoom > 22 ||
        !Number.isInteger(limit) || limit < 1 || limit > 200
      ) throw new ApiError(400, 'INVALID_MAP_BOUNDS', 'Batas peta, zoom, atau limit tidak valid.');

      res.json({ success: true, data: zoom < 14 ? [] : await repository.inBounds(bounds, zoom, limit) });
    } catch (error) { next(error); }
  });

  return router;
}
