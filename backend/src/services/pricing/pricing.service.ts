import type { PricingConfig, PricingResult } from '../../types/index.js';
export class PricingService {
  constructor(private readonly config: PricingConfig) {}
  calculate(distanceKm: number): PricingResult {
    if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new RangeError('Distance must be finite and nonnegative');
    const additionalKm = Math.max(0, distanceKm - this.config.includedKm);
    const billableKm = Math.ceil(additionalKm);
    const distanceFare = billableKm * this.config.pricePerKm;
    return { ...this.config, additionalKm, billableKm, distanceFare, total: Math.max(this.config.minimumFare, this.config.baseFare + distanceFare) };
  }
}
