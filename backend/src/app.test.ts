import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from './app.js';
import { config, normalizeWhatsAppNumber } from './config.js';
import { validatePoint } from './validation.js';
import { ApiError } from './errors.js';
const pickup = { lat: -8.4932, lng: 140.4018 }; const destination = { lat: -8.4965, lng: 140.4072 };
test('WhatsApp number accepts common formatting and disables invalid input', () => {
  assert.equal(normalizeWhatsAppNumber('+62 812-3456-7890'), '6281234567890');
  assert.equal(normalizeWhatsAppNumber(''), '');
  assert.equal(normalizeWhatsAppNumber('nomor-belum-diisi'), '');
});
test('coordinate validation rejects strings, missing fields, nonfinite numbers and ranges', () => {
  for (const point of [null, {}, { lat: '-8', lng: 140 }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: NaN, lng: 0 }, { lat: 0, lng: Infinity }]) assert.throws(() => validatePoint(point, 'pickup'), error => error instanceof ApiError && error.status === 400);
  assert.deepEqual(validatePoint({ lat: -90, lng: 180 }, 'pickup'), { lat: -90, lng: 180 });
});
test('API health, pricing authority, geometry, errors and CORS', async () => {
  let calls = 0;
  let geocodingCalls = 0;
  const app = createApp(
    { async route(a, b, geometry) { calls++; assert.deepEqual(a, pickup); assert.deepEqual(b, destination); return { distanceKm: 5.2, durationMinutes: 12, ...(geometry ? { geometry: { type: 'LineString' as const, coordinates: [[140.4018, -8.4932], [140.4072, -8.4965]] as [number, number][] } } : {}) }; } },
    {
      async reverse(point) { geocodingCalls++; assert.deepEqual(point, pickup); return { ...pickup, name: 'Warung Mie Ayam', address: 'Jalan Mandala, Merauke' }; },
      async search(query, near) { geocodingCalls++; assert.equal(query, 'Warung Mie Ayam'); assert.deepEqual(near, pickup); return [{ ...pickup, name: query, address: 'Jalan Mandala, Merauke' }]; },
    },
  );
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const health = await fetch(`${base}/health`); assert.deepEqual(await health.json(), { success: true, message: 'AntarFix Estimator API is running' });
    const response = await fetch(`${base}/api/estimate?geometry=true`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: config.frontendUrl }, body: JSON.stringify({ pickup, destination, distanceKm: 0, estimatedCost: 1 }) });
    const body = await response.json(); assert.equal(response.status, 200); assert.equal(body.data.pricing.total, 18000); assert.equal(body.data.geometry.type, 'LineString'); assert.equal(response.headers.get('access-control-allow-origin'), config.frontendUrl);
    for (const bad of [{ pickup, destination: { lat: 99, lng: 140 } }, { pickup: { lat: 0, lng: '0' }, destination }, {}]) {
      const result = await fetch(`${base}/api/estimate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bad) }); assert.equal(result.status, 400); assert.equal((await result.json()).success, false);
    }
    assert.equal(calls, 1);
    const malformed = await fetch(`${base}/api/estimate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }); assert.equal(malformed.status, 400);
    const forbidden = await fetch(`${base}/api/estimate`, { method: 'POST', headers: { Origin: 'https://untrusted.example' } }); assert.equal(forbidden.status, 403); assert.equal(forbidden.headers.get('access-control-allow-origin'), null);
    const publicConfig = await fetch(`${base}/api/config`); assert.equal((await publicConfig.json()).data.pricing.baseFare, config.pricing.baseFare);
    const reverse = await fetch(`${base}/api/geocode/reverse?lat=${pickup.lat}&lng=${pickup.lng}`); assert.equal((await reverse.json()).data.name, 'Warung Mie Ayam');
    const search = await fetch(`${base}/api/geocode/search?q=${encodeURIComponent('Warung Mie Ayam')}&lat=${pickup.lat}&lng=${pickup.lng}`); assert.equal((await search.json()).data[0].address, 'Jalan Mandala, Merauke');
    assert.equal(geocodingCalls, 2);
    for (const path of ['/api/geocode/reverse?lat=91&lng=0', '/api/geocode/search?q=ab']) {
      const invalid = await fetch(`${base}${path}`); assert.equal(invalid.status, 400); assert.equal((await invalid.json()).success, false);
    }
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('map places endpoint returns surveyed places and validates bounds', async () => {
  let receivedZoom = 0;
  const app = createApp(
    { async route() { return { distanceKm: 1, durationMinutes: 2 }; } },
    { async reverse() { return null; }, async search() { return []; } },
    {
      async search() { return []; },
      async nearest() { return null; },
      async inBounds(bounds, zoom) {
        assert.deepEqual(bounds, { north: -8.4, south: -8.6, east: 140.5, west: 140.3 });
        receivedZoom = zoom;
        return [{ id: 'survey-1', name: 'Warung Survei', address: 'Merauke', lat: -8.49, lng: 140.4, minZoom: 16, labelPriority: 0, source: 'antarfix' }];
      },
    },
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const response = await fetch(`${base}/api/places/map?north=-8.4&south=-8.6&east=140.5&west=140.3&zoom=16`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(receivedZoom, 16);
    assert.equal(body.data[0].name, 'Warung Survei');
    const invalid = await fetch(`${base}/api/places/map?north=-8.6&south=-8.4&east=140.5&west=140.3&zoom=16`);
    assert.equal(invalid.status, 400);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
