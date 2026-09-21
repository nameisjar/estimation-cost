import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  locationName,
  locationPrecision,
  locationWithFallback,
  locationWithMapFallback,
  normalizeMeraukeAddress,
  preferredLocationAddress,
  unnamedBuildingLabel,
} from './location-label';

const point = { lat: -8.4932, lng: 140.4018, address: 'Karang Indah, Merauke' };

test('administrative names use a target-specific location fallback', () => {
  assert.equal(locationName({ ...point, name: 'Merauke', type: 'city' }, 'pickup'), 'Titik jemput pilihan');
  assert.equal(locationName({ ...point, name: 'Karang Indah', type: 'suburb' }, 'destination'), 'Titik tujuan pilihan');
  assert.equal(locationName({ ...point, name: 'Lokasi dipilih' }, 'pickup'), 'Titik jemput pilihan');
});

test('road names are descriptive and specific place names are preserved', () => {
  assert.equal(locationName({ ...point, name: 'Jalan Mandala', type: 'residential' }, 'pickup'), 'Titik di Jalan Mandala');
  assert.equal(locationName({ ...point, name: 'Warung Mie Ayam', type: 'restaurant' }, 'destination'), 'Warung Mie Ayam');
  assert.deepEqual(
    locationWithFallback({ ...point, name: 'Merauke', type: 'city' }, 'destination'),
    { ...point, name: 'Titik tujuan pilihan', type: 'city' },
  );
});

test('map selection rejects a distant place name while preserving its address', () => {
  const selected = { lat: -8.49, lng: 140.39 };
  const distant = locationWithMapFallback(selected, {
    lat: -8.49,
    lng: 140.3903,
    name: 'dcafe & bistro',
    address: 'Jalan Karang Indah, Merauke',
    distanceMeters: 33,
  }, 'destination');
  assert.equal(distant?.name, 'Titik tujuan di peta');
  assert.equal(distant?.address, 'Jalan Karang Indah, Merauke');
});

test('map selection keeps a place name within ten meters', () => {
  const selected = { lat: -8.49, lng: 140.39 };
  const nearby = locationWithMapFallback(selected, {
    lat: -8.49004,
    lng: 140.39,
    name: 'Toko Tepat',
    address: 'Merauke',
  }, 'pickup');
  assert.equal(nearby?.name, 'Toko Tepat');
});

test('map selection accepts a nearby road name beyond the POI distance limit', () => {
  const selected = { lat: -8.4932, lng: 140.4018 };
  const road = locationWithMapFallback(selected, {
    lat: -8.4932,
    lng: 140.40225,
    name: 'Jalan Brawijaya',
    address: 'Mandala, Merauke, Papua Selatan',
    type: 'secondary',
    distanceMeters: 49,
  }, 'destination');

  assert.equal(road?.name, 'Titik di Jalan Brawijaya');
  assert.equal(road?.address, 'Mandala, Merauke, Papua Selatan');
});

test('main OSM road classes use the road distance limit', () => {
  const selected = { lat: -8.4932, lng: 140.4018 };
  for (const type of ['trunk', 'trunk_link', 'motorway', 'primary_link']) {
    const road = locationWithMapFallback(selected, {
      lat: -8.4932,
      lng: 140.40225,
      name: 'Jalan Brawijaya',
      address: 'Mandala, Merauke, Papua Selatan',
      type,
      distanceMeters: 49,
    }, 'destination');

    assert.equal(road?.name, 'Titik di Jalan Brawijaya', `road type ${type}`);
  }
});

test('map selection still rejects a road name that is too far from the pin', () => {
  const selected = { lat: -8.4932, lng: 140.4018 };
  const road = locationWithMapFallback(selected, {
    lat: -8.4932,
    lng: 140.403,
    name: 'Jalan Lain',
    address: 'Merauke, Papua Selatan',
    type: 'residential',
    distanceMeters: 132,
  }, 'destination');

  assert.equal(road?.name, 'Titik tujuan di peta');
});

test('location precision distinguishes exact places from roads and generic coordinates', () => {
  assert.equal(locationPrecision({ ...point, name: 'Warung Mie Ayam', type: 'restaurant' }), 'exact');
  assert.equal(locationPrecision({ ...point, name: 'Bangunan dipilih', geometry: {
    type: 'Polygon',
    coordinates: [[[140.4, -8.49], [140.41, -8.49], [140.4, -8.49]]],
  } }), 'exact');
  assert.equal(locationPrecision({ ...point, name: 'Titik di Jalan Mandala', type: 'residential' }), 'road');
  assert.equal(locationPrecision({ ...point, name: 'Titik tujuan di peta' }), 'approximate');
  assert.equal(locationPrecision(null), 'approximate');
});

test('unnamed buildings use the most informative available address', () => {
  const detailed = 'Jl. Nusa Barong, Merauke, Distrik Semangga, Kabupaten Merauke, Papua Selatan 99613';
  assert.equal(preferredLocationAddress('Jl. Nusa Barong', detailed, '-8.49, 140.38'), detailed);
  assert.equal(preferredLocationAddress('Jl. Nusa Barong No. 8', '', '-8.49, 140.38'), 'Jl. Nusa Barong No. 8');
  assert.equal(unnamedBuildingLabel(detailed), 'Bangunan di Jl. Nusa Barong');
  assert.equal(unnamedBuildingLabel('Mandala, Merauke, Papua Selatan'), 'Lokasi di Mandala');
  assert.equal(unnamedBuildingLabel('Merauke, Papua Selatan'), 'Lokasi pada bangunan');
});

test('incorrect Merauke administrative levels from old cached data are normalized', () => {
  assert.equal(
    normalizeMeraukeAddress('Jl. Nusa Barong, Distrik Mandala, Kabupaten Semangga, Papua Selatan'),
    'Jl. Nusa Barong, Mandala, Distrik Merauke, Kabupaten Merauke, Papua Selatan',
  );
});
