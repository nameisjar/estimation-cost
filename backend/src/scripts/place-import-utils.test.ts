import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coordinatesFromMapsUrl,
  normalizePlaceCategory,
  resolvePlaceCoordinates,
  requiredPlaceCoordinates,
} from './place-import-utils.js';
import { classifyPlace } from '../services/places/place-classification.js';

test('normalizes survey keywords into map icon categories', () => {
  assert.equal(normalizePlaceCategory('', 'rumah sakit', 'RSUD Merauke'), 'medical');
  assert.equal(normalizePlaceCategory('', 'toko elektronik', 'Toko Komputer'), 'retail');
  assert.equal(normalizePlaceCategory('', 'sekolah', 'SMA Negeri 1'), 'education');
  assert.equal(normalizePlaceCategory('', 'restoran', 'Bakso Babe'), 'food');
  assert.equal(normalizePlaceCategory('', '', 'Lokasi Tidak Dikenal'), 'other');
});

test('assigns specific icons from the actual place name or category', () => {
  assert.deepEqual(classifyPlace('RSUD Merauke', ''), { category: 'medical', iconType: 'hospital' });
  assert.deepEqual(classifyPlace('Klinik Sta Elizabeth', ''), { category: 'medical', iconType: 'clinic' });
  assert.deepEqual(classifyPlace('Apotek Kasih Karunia', ''), { category: 'medical', iconType: 'pharmacy' });
  assert.deepEqual(classifyPlace('SMA Negeri 1 Merauke', ''), { category: 'education', iconType: 'school' });
  assert.deepEqual(classifyPlace('RS Bunda Pengharapan', ''), { category: 'medical', iconType: 'hospital' });
  assert.deepEqual(classifyPlace('Perpustakaan Daerah', ''), { category: 'education', iconType: 'education' });
  assert.deepEqual(classifyPlace('Rental Mobil Merauke', ''), { category: 'automotive', iconType: 'automotive' });
  assert.deepEqual(classifyPlace('Mie Ayam Jago', ''), { category: 'food', iconType: 'restaurant' });
  assert.deepEqual(classifyPlace('Nasi Goreng Mandala', ''), { category: 'food', iconType: 'restaurant' });
  assert.deepEqual(classifyPlace('Kedai Sate Merauke', ''), { category: 'food', iconType: 'restaurant' });
  assert.deepEqual(classifyPlace('Lapangan Basket Mandala', ''), { category: 'sports', iconType: 'basketball' });
  assert.deepEqual(classifyPlace('Lapangan Sepakbola Wasur', ''), { category: 'sports', iconType: 'football' });
  assert.deepEqual(classifyPlace('Stadion Katalpal Merauke', ''), { category: 'sports', iconType: 'stadium' });
  assert.deepEqual(classifyPlace('Pantai Lampu Satu', ''), { category: 'tourism', iconType: 'beach' });
  assert.deepEqual(classifyPlace('Praktik Bidan Mandiri', ''), { category: 'medical', iconType: 'midwife' });
  assert.deepEqual(classifyPlace('Praktik Fisioterapi Bephysio', ''), { category: 'medical', iconType: 'physiotherapy' });
});

test('uses the survey keyword only as a fallback after recognizable names', () => {
  assert.equal(normalizePlaceCategory('', 'rumah sakit', 'Lokasi Tidak Dikenal'), 'medical');
  assert.equal(normalizePlaceCategory('', 'rumah sakit', 'TPS B3'), 'service');
  assert.deepEqual(classifyPlace('PT Contoh', '', 'kontraktor'), { category: 'business', iconType: 'contractor' });
  assert.deepEqual(classifyPlace('PT Kirim', 'transport', 'jasa ekspedisi'), { category: 'transport', iconType: 'delivery' });
  assert.deepEqual(classifyPlace('PT Angkutan', 'transport'), { category: 'transport', iconType: 'transport' });
  assert.deepEqual(classifyPlace('TPS B3', 'medical', 'rumah sakit'), { category: 'service', iconType: 'waste' });
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

test('repairs invalid CSV coordinates from a Google Maps URL', () => {
  assert.deepEqual(
    resolvePlaceCoordinates(
      {
        latitude: '140.4018',
        longitude: 'invalid',
        googleMapsUrl: 'https://www.google.com/maps/place/Contoh/@-8.4932,140.4018,17z',
      },
      12,
    ),
    { lat: -8.4932, lng: 140.4018, correction: 'google-maps-url' },
  );
});

test('repairs clearly swapped latitude and longitude', () => {
  assert.deepEqual(
    resolvePlaceCoordinates({ latitude: '140.4018', longitude: '−8.4932' }, 13),
    { lat: -8.4932, lng: 140.4018, correction: 'swapped' },
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
