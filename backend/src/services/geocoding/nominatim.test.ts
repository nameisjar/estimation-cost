import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NominatimProvider } from './nominatim.provider.js';

test('Nominatim provider normalizes places, identifies the app and caches repeated reverse requests', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; headers: Headers }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    const body = url.includes('/reverse?')
      ? { lat: '-8.4932', lon: '140.4018', name: 'Warung Mie Ayam', display_name: 'Warung Mie Ayam, Jalan Mandala, Merauke', type: 'restaurant' }
      : [{ lat: '-8.4932', lon: '140.4018', display_name: 'Warung Mie Ayam, Jalan Mandala, Merauke', namedetails: { name: 'Warung Mie Ayam' } }];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const provider = new NominatimProvider(
      'https://nominatim.example',
      1000,
      'AntarFixEstimator/Test',
      'https://estimator.example',
      {
        minimumIntervalMs: 0,
        searchRadiusKm: 20,
        serviceLimits: { centerLat: -8.4932, centerLng: 140.4018, radiusKm: 50, maxDistanceKm: 50 },
      },
    );
    const point = { lat: -8.4932, lng: 140.4018 };
    const reverse = await provider.reverse(point);
    assert.deepEqual(reverse, { ...point, name: 'Warung Mie Ayam', address: 'Jalan Mandala, Merauke', type: 'restaurant' });
    assert.deepEqual(await provider.reverse(point), reverse);
    const results = await provider.search('Warung Mie Ayam', point);
    assert.equal(results[0]?.name, 'Warung Mie Ayam');
    assert.equal(calls.length, 2);
    assert.match(calls[1]!.url, /countrycodes=id/);
    assert.match(calls[1]!.url, /bounded=1/);
    assert.match(calls[1]!.url, /viewbox=/);
    assert.match(calls[1]!.url, /limit=8/);
    assert.equal(calls[0]!.headers.get('user-agent'), 'AntarFixEstimator/Test');
    assert.equal(calls[0]!.headers.get('referer'), 'https://estimator.example');
  } finally { globalThis.fetch = originalFetch; }
});

test('Nominatim search retries across the service area when nearby results are empty', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async input => {
    calls.push(String(input));
    const body = calls.length === 1
      ? []
      : [{ lat: '-8.4000', lon: '140.4000', name: 'Warung Ayam Kampung', display_name: 'Warung Ayam Kampung, Merauke, Papua Selatan' }];
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const provider = new NominatimProvider(
      'https://nominatim.example',
      1000,
      'AntarFixEstimator/Test',
      'https://estimator.example',
      {
        minimumIntervalMs: 0,
        searchRadiusKm: 10,
        serviceLimits: { centerLat: -8.4932, centerLng: 140.4018, radiusKm: 50, maxDistanceKm: 50 },
      },
    );
    const results = await provider.search('Warung Ayam', { lat: -8.4932, lng: 140.4018 });
    assert.equal(results[0]?.name, 'Warung Ayam Kampung');
    assert.equal(calls.length, 2);
    assert.notEqual(new URL(calls[0]!).searchParams.get('viewbox'), new URL(calls[1]!).searchParams.get('viewbox'));
    assert.equal(new URL(calls[1]!).searchParams.get('bounded'), '1');
    assert.deepEqual(await provider.search('Warung Ayam', { lat: -8.4932, lng: 140.4018 }), results);
    assert.equal(calls.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
