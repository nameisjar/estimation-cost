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
      ? {
          lat: '-8.4932', lon: '140.4018', name: 'Warung Mie Ayam',
          display_name: 'Warung Mie Ayam, Jalan Mandala, Merauke', type: 'restaurant',
          geojson: { type: 'Polygon', coordinates: [[[140.4017, -8.4933], [140.4019, -8.4933], [140.4019, -8.4931], [140.4017, -8.4933]]] },
        }
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
    const reverse = await provider.reverse(point, { includeGeometry: true });
    assert.deepEqual(reverse, {
      ...point,
      name: 'Warung Mie Ayam',
      address: 'Jalan Mandala, Merauke',
      type: 'restaurant',
      source: 'openstreetmap',
      geometry: { type: 'Polygon', coordinates: [[[140.4017, -8.4933], [140.4019, -8.4933], [140.4019, -8.4931], [140.4017, -8.4933]]] },
    });
    assert.deepEqual(await provider.reverse(point, { includeGeometry: true }), reverse);
    const results = await provider.search('Warung Mie Ayam', point);
    assert.equal(results[0]?.name, 'Warung Mie Ayam');
    assert.equal(calls.length, 2);
    assert.match(calls[1]!.url, /countrycodes=id/);
    assert.match(calls[1]!.url, /bounded=1/);
    assert.match(calls[1]!.url, /viewbox=/);
    assert.match(calls[1]!.url, /limit=8/);
    assert.equal(new URL(calls[0]!.url).searchParams.get('polygon_geojson'), '1');
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

test('Nominatim reverse keeps trunk roads and uses address road for a generic result', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    {
      lat: '-8.4932', lon: '140.4018', name: 'Jalan Brawijaya', type: 'trunk',
      display_name: 'Jalan Brawijaya, Mandala, Merauke, Papua Selatan',
      address: { road: 'Jalan Brawijaya', suburb: 'Mandala', city: 'Merauke' },
    },
    {
      lat: '-8.4940', lon: '140.4020', name: 'Merauke', type: 'administrative',
      display_name: 'Jalan Brawijaya, Mandala, Merauke, Papua Selatan',
      address: { road: 'Jalan Brawijaya', suburb: 'Mandala', city: 'Merauke' },
    },
  ];
  globalThis.fetch = async () => new Response(JSON.stringify(responses.shift()), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
  try {
    const provider = new NominatimProvider(
      'https://nominatim.example',
      1000,
      'AntarFixEstimator/Test',
      'https://estimator.example',
      { minimumIntervalMs: 0 },
    );

    const trunk = await provider.reverse({ lat: -8.4932, lng: 140.4018 });
    assert.equal(trunk?.name, 'Jalan Brawijaya');
    assert.equal(trunk?.type, 'trunk');

    const generic = await provider.reverse({ lat: -8.494, lng: 140.402 });
    assert.equal(generic?.name, 'Jalan Brawijaya');
    assert.equal(generic?.type, 'road');
  } finally { globalThis.fetch = originalFetch; }
});

test('Nominatim formats Indonesian administrative levels and omits the country', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    lat: '-8.49176',
    lon: '140.38665',
    type: 'building',
    display_name: 'Jalan Nusa Barong, Merauke, Semangga, Merauke Regency, Papua Selatan, 99613, Indonesia',
    address: {
      road: 'Jl. Nusa Barong',
      village: 'Merauke',
      city_district: 'Semangga',
      county: 'Merauke Regency',
      state: 'Papua Selatan',
      postcode: '99613',
      country: 'Indonesia',
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const provider = new NominatimProvider(
      'https://nominatim.example',
      1000,
      'AntarFixEstimator/Test',
      'https://estimator.example',
      { minimumIntervalMs: 0 },
    );
    const result = await provider.reverse({ lat: -8.49176, lng: 140.38665 });
    assert.equal(
      result?.address,
      'Jl. Nusa Barong, Merauke, Distrik Semangga, Kabupaten Merauke, Papua Selatan 99613',
    );
    assert.doesNotMatch(result?.address || '', /Indonesia/i);
  } finally { globalThis.fetch = originalFetch; }
});
