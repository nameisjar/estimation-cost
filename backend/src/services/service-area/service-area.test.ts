import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../errors.js';
import { directDistanceKm, ServiceAreaService } from './service-area.service.js';

const limits = { centerLat: -8.4932, centerLng: 140.4018, radiusKm: 50, maxDistanceKm: 50 };

test('service area accepts nearby points and rejects locations outside the configured radius', () => {
  const service = new ServiceAreaService(limits);
  assert.ok(directDistanceKm(
    { lat: limits.centerLat, lng: limits.centerLng },
    { lat: -8.4965, lng: 140.4072 },
  ) < 1);
  assert.doesNotThrow(() => service.assertPointAllowed({ lat: -8.4965, lng: 140.4072 }, 'Titik tujuan'));
  assert.throws(
    () => service.assertPointAllowed({ lat: -6.2, lng: 106.8 }, 'Titik tujuan'),
    error => error instanceof ApiError && error.status === 422 && error.code === 'OUTSIDE_SERVICE_AREA',
  );
});

test('service area rejects route distances over the configured delivery limit', () => {
  const service = new ServiceAreaService(limits);
  assert.doesNotThrow(() => service.assertRouteAllowed(50));
  assert.throws(
    () => service.assertRouteAllowed(50.01),
    error => error instanceof ApiError && error.status === 422 && error.code === 'DELIVERY_DISTANCE_EXCEEDED',
  );
});
