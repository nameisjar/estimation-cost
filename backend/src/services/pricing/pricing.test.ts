import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PricingService } from './pricing.service.js';
const config = { baseFare: 15000, includedKm: 2, pricePerKm: 3000, minimumFare: 15000 };
const pricing = new PricingService(config);
for (const [distance, total] of [[0, 15000], [1, 15000], [2, 15000], [2.001, 18000], [3, 18000], [3.001, 21000], [5.2, 27000], [10, 39000]]) {
  test(`distance ${distance} km costs ${total}`, () => assert.equal(pricing.calculate(distance).total, total));
}
test('minimum fare respected', () => assert.equal(new PricingService({ ...config, minimumFare: 20000 }).calculate(1).total, 20000));
test('pricing breakdown uses ceiling only on additional km', () => {
  const result = pricing.calculate(5.2);
  assert.equal(result.billableKm, 4); assert.equal(result.distanceFare, 12000);
});
test('rejects invalid distances', () => { for (const value of [-1, NaN, Infinity]) assert.throws(() => pricing.calculate(value), RangeError); });
