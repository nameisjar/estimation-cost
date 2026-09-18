import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationName, locationWithFallback } from './location-label';

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
