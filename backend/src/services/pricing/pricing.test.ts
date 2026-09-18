import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PricingService } from './pricing.service.js';
const config = { baseFare: 8000, includedKm: 2, pricePerKm: 2500, minimumFare: 8000 };
const pricing = new PricingService(config);
for (const [distance, total] of [[0, 8000], [1, 8000], [2, 8000], [2.001, 10500], [3, 10500], [3.001, 13000], [5.2, 18000], [10, 28000]]) {
  test(`distance ${distance} km costs ${total}`, () => assert.equal(pricing.calculate(distance).total, total));
}
test('minimum fare respected', () => assert.equal(new PricingService({ ...config, minimumFare: 12000 }).calculate(1).total, 12000));
test('pricing breakdown uses ceiling only on additional km', () => {
  const result = pricing.calculate(5.2);
  assert.equal(result.billableKm, 4); assert.equal(result.distanceFare, 10000);
});
test('rejects invalid distances', () => { for (const value of [-1, NaN, Infinity]) assert.throws(() => pricing.calculate(value), RangeError); });
