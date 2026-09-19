import { Router } from 'express';
import { ApiError } from '../errors.js';
import type { MapBounds, PlaceRepository } from '../types/index.js';

function finiteQuery(value: unknown, name: string): number {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new ApiError(400, 'INVALID_MAP_BOUNDS', `${name} harus berupa angka.`);
  return parsed;
}

export function placeRoutes(repository?: PlaceRepository) {
  const router = Router();

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
