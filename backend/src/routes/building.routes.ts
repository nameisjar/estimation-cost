import { Router } from 'express';
import type { BuildingRepository } from '../types/index.js';
import { validatePoint } from '../validation.js';

export function buildingRoutes(repository?: BuildingRepository) {
  const router = Router();

  router.get('/buildings/at', async (req, res, next) => {
    try {
      const point = validatePoint({ lat: Number(req.query.lat), lng: Number(req.query.lng) }, 'lokasi bangunan');
      res.json({ success: true, data: repository ? await repository.findAt(point) : null });
    } catch (error) { next(error); }
  });

  return router;
}
