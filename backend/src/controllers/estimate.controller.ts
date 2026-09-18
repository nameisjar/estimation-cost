import type { Request, Response } from 'express';
import type { RoutingService } from '../services/routing/routing.service.js';
import type { PricingService } from '../services/pricing/pricing.service.js';
import type { ServiceAreaService } from '../services/service-area/service-area.service.js';
import { validatePoint } from '../validation.js';
export function estimateController(routing: RoutingService, pricing: PricingService, serviceArea: ServiceAreaService) {
  return async (req: Request, res: Response) => {
    const pickup = validatePoint(req.body?.pickup, 'pickup');
    const destination = validatePoint(req.body?.destination, 'destination');
    serviceArea.assertPointAllowed(pickup, 'Titik jemput');
    serviceArea.assertPointAllowed(destination, 'Titik tujuan');
    // The default estimate uses overview=false. The UI opts in to road geometry.
    const route = await routing.calculate(pickup, destination, req.query.geometry === 'true');
    serviceArea.assertRouteAllowed(route.distanceKm);
    res.json({ success: true, data: { ...route, pricing: pricing.calculate(route.distanceKm) } });
  };
}
