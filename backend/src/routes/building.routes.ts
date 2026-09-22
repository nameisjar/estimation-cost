import { Router } from 'express';
import type { BuildingRepository, PlaceRepository } from '../types/index.js';
import { validatePoint } from '../validation.js';

export function buildingRoutes(repository?: BuildingRepository, places?: PlaceRepository) {
  const router = Router();

  router.get('/buildings/at', async (req, res, next) => {
    try {
      const point = validatePoint({ lat: Number(req.query.lat), lng: Number(req.query.lng) }, 'lokasi bangunan');
      res.json({ success: true, data: repository ? await repository.findAt(point) : null });
    } catch (error) { next(error); }
  });

  router.get('/locations/at', async (req, res, next) => {
    try {
      const point = validatePoint({ lat: Number(req.query.lat), lng: Number(req.query.lng) }, 'lokasi');
      const [building, place] = await Promise.all([
        repository ? repository.findAt(point) : null,
        places ? places.nearest(point) : null,
      ]);
      res.json({ success: true, data: { building, place } });
    } catch (error) { next(error); }
  });

  return router;
}
