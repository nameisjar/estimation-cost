import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coordinatesFromMapsUrl,
  normalizePlaceCategory,
  requiredPlaceCoordinates,
} from './place-import-utils.js';

test('normalizes survey keywords into map icon categories', () => {
  assert.equal(normalizePlaceCategory('', 'rumah sakit', 'RSUD Merauke'), 'medical');
  assert.equal(normalizePlaceCategory('', 'toko elektronik', 'Toko Komputer'), 'retail');
  assert.equal(normalizePlaceCategory('', 'sekolah', 'SMA Negeri 1'), 'education');
  assert.equal(normalizePlaceCategory('', 'restoran', 'Bakso Babe'), 'food');
  assert.equal(normalizePlaceCategory('', '', 'Lokasi Tidak Dikenal'), 'other');
});

test('recovers missing CSV coordinates from a Google Maps URL', () => {
  const googleMapsUrl =
    'https://www.google.com/maps/place/Megaria/data=!4m7!3d-8.4991766!4d140.3960674';
  assert.deepEqual(coordinatesFromMapsUrl(googleMapsUrl), {
    lat: -8.4991766,
    lng: 140.3960674,
  });
  assert.deepEqual(
    requiredPlaceCoordinates(
      { latitude: '', longitude: '', googleMapsUrl },
      475,
    ),
    { lat: -8.4991766, lng: 140.3960674 },
  );
});

test('prefers valid explicit CSV coordinates over URL coordinates', () => {
  assert.deepEqual(
    requiredPlaceCoordinates(
      {
        latitude: '-8.49',
        longitude: '140.4',
        googleMapsUrl:
          'https://www.google.com/maps/place/Other/data=!3d-1.2!4d100.2',
      },
      2,
    ),
    { lat: -8.49, lng: 140.4 },
  );
});

test('still rejects missing and out-of-range coordinates', () => {
  assert.throws(
    () => requiredPlaceCoordinates({}, 8),
    /Baris 8: latitude wajib/,
  );
  assert.throws(
    () =>
      requiredPlaceCoordinates(
        { googleMapsUrl: 'https://www.google.com/maps/place/X/@-98,220,17z' },
        9,
      ),
    /Baris 9: latitude wajib/,
  );
});
