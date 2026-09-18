import { Router } from 'express';
import { estimateController } from '../controllers/estimate.controller.js';
import type { RoutingService } from '../services/routing/routing.service.js';
import type { PricingService } from '../services/pricing/pricing.service.js';
import type { ServiceAreaService } from '../services/service-area/service-area.service.js';
export function estimateRoutes(routing: RoutingService, pricing: PricingService, serviceArea: ServiceAreaService) {
  const router = Router();
  router.post('/estimate', estimateController(routing, pricing, serviceArea));
  return router;
}
