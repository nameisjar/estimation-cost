import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PlaceCsvImportService,
  parsePlaceCsv,
  placeCsvColumns,
  type SurveyPlaceImportRepository,
} from './place-csv-import.service.js';

const limits = { centerLat: -8.4932, centerLng: 140.4018, radiusKm: 50, maxDistanceKm: 50 };
const header = placeCsvColumns.join(',');

test('CSV parser validates rows and merges duplicates within the same file', () => {
  const csv = [
    header,
    'id-1,Tempat Baru,toko,Jalan Satu,-8.4932,140.4018,4.5,10,,,,,,Merauke,2026-09-20',
    'id-1,Tempat Baru Duplikat,toko,Jalan Dua,-8.4933,140.4019,4,5,0812,,,,,Merauke,2026-09-20',
    ',Tanpa Koordinat,toko,Jalan Tiga,,,4,5,,,,,,Merauke,2026-09-20',
  ].join('\n');
  const parsed = parsePlaceCsv(csv, limits);
  assert.equal(parsed.totalRows, 3);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0]?.place.name, 'Tempat Baru');
  assert.equal(parsed.records[0]?.place.phone, '0812');
  assert.equal(parsed.mergedRows, 1);
  assert.match(parsed.merges[0]?.message || '', /Digabung otomatis dengan baris 2/);
  assert.equal(parsed.issues.length, 1);
  assert.match(parsed.issues[0]?.message || '', /latitude wajib/);
});

test('CSV parser requires the documented header', () => {
  assert.throws(
    () => parsePlaceCsv('name,latitude,longitude\nContoh,-8.49,140.4', limits),
    /Kolom CSV belum lengkap/,
  );
});

test('CSV parser does not impose the former 5,000 row limit', () => {
  const rows = Array.from({ length: 5_001 }, (_, index) => (
    `id-${index},Tempat ${index},toko,Jalan Contoh,-8.4932,140.4018,4,1,,,,,,Merauke,2026-09-20`
  ));
  const parsed = parsePlaceCsv([header, ...rows].join('\n'), limits);
  assert.equal(parsed.totalRows, 5_001);
  assert.equal(parsed.records.length, 5_001);
  assert.equal(parsed.issues.length, 0);
});

test('CSV parser keeps valid locations outside the service area as warnings', async () => {
  const csv = [
    header,
    'far-1,Lokasi Jauh,wisata,Jalan Luar Area,-7.1000,140.4018,4,1,,,,,,Papua Selatan,2026-09-20',
  ].join('\n');
  const parsed = parsePlaceCsv(csv, limits);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.outsideServiceRows, 1);
  assert.match(parsed.warnings[0]?.message || '', /tetap diimpor/);

  const repository: SurveyPlaceImportRepository = {
    async classifySurveyPlace() { return 'inserted'; },
    async importSurveyPlaces(places) {
      assert.equal(places.length, 1);
      return { inserted: 1, updated: 0, skipped: 0 };
    },
  };
  const service = new PlaceCsvImportService(repository, limits);
  const preview = await service.preview(csv, 'upsert');
  assert.equal(preview.validRows, 1);
  assert.equal(preview.newRows, 1);
  assert.equal(preview.skippedRows, 0);
  assert.equal(preview.outsideServiceRows, 1);
});

test('CSV preview and commit report inserts, updates, invalid and insert-only skips', async () => {
  const csv = [
    header,
    'new-1,Tempat Baru,toko,Jalan Satu,-8.4932,140.4018,4.5,10,,,,,,Merauke,2026-09-20',
    'old-1,Tempat Lama,klinik,Jalan Dua,-8.495,140.405,4,5,,,,,,Merauke,2026-09-20',
    ',Rusak,toko,Jalan Tiga,abc,140.4,,,,,,,,Merauke,2026-09-20',
  ].join('\n');
  const repository: SurveyPlaceImportRepository = {
    async classifySurveyPlace(place) { return place.externalPlaceId === 'old-1' ? 'updated' : 'inserted'; },
    async importSurveyPlaces(places, mode) {
      assert.equal(places.length, 2);
      assert.equal(mode, 'insert-only');
      return { inserted: 1, updated: 0, skipped: 1 };
    },
  };
  const service = new PlaceCsvImportService(repository, limits);
  const preview = await service.preview(csv, 'insert-only');
  assert.deepEqual(
    { total: preview.totalRows, valid: preview.validRows, invalid: preview.invalidRows, fresh: preview.newRows, updates: preview.updateRows, skipped: preview.skippedRows },
    { total: 3, valid: 2, invalid: 1, fresh: 1, updates: 1, skipped: 2 },
  );
  const result = await service.commit(csv, 'insert-only');
  assert.equal(result.inserted, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.skippedRows, 2);
});
