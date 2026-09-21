import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OsrmProvider } from './osrm.provider.js';
import { FallbackRoutingProvider } from './fallback-routing.provider.js';
import { ApiError } from '../../errors.js';
const pickup = { lat: -8.4932, lng: 140.4018 }; const destination = { lat: -8.4965, lng: 140.4072 };
const request = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
test('OSRM coordinate order, overview=false, exact units', async () => {
  const provider = new OsrmProvider('https://example.com', 1000, (async input => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/route/v1/driving/140.4018,-8.4932;140.4072,-8.4965');
    assert.equal(url.searchParams.get('overview'), 'false');
    return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 5200.123, duration: 720 }] }));
  }) as typeof fetch);
  assert.deepEqual(await provider.route(pickup, destination), { distanceKm: 5.200123, durationMinutes: 12 });
});
test('requests GeoJSON road geometry', async () => {
  const geometry = { type: 'LineString', coordinates: [[140.4018, -8.4932], [140.4072, -8.4965]] };
  const provider = new OsrmProvider('https://example.com', 1000, (async input => {
    const url = new URL(String(input)); assert.equal(url.searchParams.get('overview'), 'full'); assert.equal(url.searchParams.get('geometries'), 'geojson');
    return new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 5200, duration: 720, geometry }] }));
  }) as typeof fetch);
  assert.deepEqual((await provider.route(pickup, destination, true)).geometry, geometry);
});
for (const [name, body, status, code] of [
  ['no route', { code: 'NoRoute' }, 200, 'NO_ROUTE'], ['no segment', { code: 'NoSegment' }, 400, 'NO_ROUTE'],
  ['HTTP failure', {}, 503, 'ROUTING_HTTP_ERROR'], ['missing route', { code: 'Ok', routes: [] }, 200, 'INVALID_ROUTING_RESPONSE'],
  ['negative distance', { code: 'Ok', routes: [{ distance: -1, duration: 30 }] }, 200, 'INVALID_ROUTING_RESPONSE'],
  ['null response', null, 200, 'INVALID_ROUTING_RESPONSE']
] as const) test(name, async () => {
  await assert.rejects(new OsrmProvider('https://example.com', 1000, request(body, status)).route(pickup, destination), error => error instanceof ApiError && error.code === code);
});
test('invalid JSON', async () => { await assert.rejects(new OsrmProvider('https://example.com', 1000, (async () => new Response('bad JSON')) as typeof fetch).route(pickup, destination), error => error instanceof ApiError && error.code === 'INVALID_ROUTING_RESPONSE'); });
test('network failure', async () => { await assert.rejects(new OsrmProvider('https://example.com', 1000, (async () => { throw new TypeError('network'); }) as typeof fetch).route(pickup, destination), error => error instanceof ApiError && error.code === 'ROUTING_NETWORK_ERROR'); });
test('timeout', async () => { await assert.rejects(new OsrmProvider('https://example.com', 1000, (async () => { throw new DOMException('timed out', 'TimeoutError'); }) as typeof fetch).route(pickup, destination), error => error instanceof ApiError && error.status === 504); });
test('missing geometry', async () => { await assert.rejects(new OsrmProvider('https://example.com', 1000, request({ code: 'Ok', routes: [{ distance: 5200, duration: 720 }] })).route(pickup, destination, true), error => error instanceof ApiError && error.code === 'INVALID_ROUTING_RESPONSE'); });
test('routing fallback is used only when the primary provider fails', async () => {
  let fallbackCalls = 0;
  const expected = { distanceKm: 5.2, durationMinutes: 12 };
  const provider = new FallbackRoutingProvider(
    { route: async () => { throw new ApiError(502, 'ROUTING_NETWORK_ERROR', 'primary unavailable'); } },
    { route: async (_pickup, _destination, geometry) => {
      fallbackCalls++;
      assert.equal(geometry, true);
      return expected;
    } },
  );
  assert.deepEqual(await provider.route(pickup, destination, true), expected);
  assert.equal(fallbackCalls, 1);
});

test('routing fallback remains idle when the primary provider succeeds', async () => {
  let fallbackCalls = 0;
  const expected = { distanceKm: 5.2, durationMinutes: 12 };
  const provider = new FallbackRoutingProvider(
    { route: async () => expected },
    { route: async () => { fallbackCalls++; return expected; } },
  );
  assert.deepEqual(await provider.route(pickup, destination), expected);
  assert.equal(fallbackCalls, 0);
});

test('routing fallback is not used for a valid no-route result', async () => {
  let fallbackCalls = 0;
  const provider = new FallbackRoutingProvider(
    { route: async () => { throw new ApiError(422, 'NO_ROUTE', 'route unavailable for these points'); } },
    { route: async () => { fallbackCalls++; return { distanceKm: 1, durationMinutes: 1 }; } },
  );
  await assert.rejects(
    provider.route(pickup, destination),
    error => error instanceof ApiError && error.code === 'NO_ROUTE',
  );
  assert.equal(fallbackCalls, 0);
});
