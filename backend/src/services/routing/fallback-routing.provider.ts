import type { LocationPoint, RouteResult, RoutingProvider } from '../../types/index.js';
import { ApiError } from '../../errors.js';

export class FallbackRoutingProvider implements RoutingProvider {
  constructor(
    private readonly primary: RoutingProvider,
    private readonly fallback: RoutingProvider,
  ) {}

  async route(pickup: LocationPoint, destination: LocationPoint, geometry = false): Promise<RouteResult> {
    try {
      return await this.primary.route(pickup, destination, geometry);
    } catch (error) {
      // A 4xx response (for example NO_ROUTE) is a valid routing result for the
      // selected coordinates. Retrying another provider would hide that result
      // and send location data outside the local server without a technical need.
      if (error instanceof ApiError && error.status < 500) throw error;
      console.error(
        'Primary routing provider failed; trying the configured fallback:',
        error instanceof Error ? error.message : error,
      );
      return this.fallback.route(pickup, destination, geometry);
    }
  }
}
