import type { LocationPoint, RoutingProvider } from '../../types/index.js';
export class RoutingService {
  constructor(private readonly provider: RoutingProvider) {}
  calculate(pickup: LocationPoint, destination: LocationPoint, geometry = false) { return this.provider.route(pickup, destination, geometry); }
}
