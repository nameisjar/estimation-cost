import 'dotenv/config';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse';
import { databasePool } from '../database.js';
import { config } from '../config.js';
import { PostgisPlaceRepository, type SurveyPlaceInput } from '../services/places/postgis-place.repository.js';

type CsvRow = Record<string, string>;
const expectedColumns = [
  'placeId', 'name', 'category', 'address', 'latitude', 'longitude', 'rating',
  'reviewCount', 'phone', 'website', 'openingHours', 'googleMapsUrl',
  'searchKeyword', 'searchArea', 'collectedAt',
];

function optionalNumber(value: string, field: string, row: number): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed)) throw new Error(`Baris ${row}: ${field} bukan angka valid.`);
  return parsed;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(b.lat - a.lat);
  const deltaLng = radians(b.lng - a.lng);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function toPlace(record: CsvRow, row: number): SurveyPlaceInput {
  const name = record.name?.trim();
  const lat = optionalNumber(record.latitude, 'latitude', row);
  const lng = optionalNumber(record.longitude, 'longitude', row);
  if (!name) throw new Error(`Baris ${row}: name wajib diisi.`);
  if (lat === undefined || lat < -90 || lat > 90) throw new Error(`Baris ${row}: latitude wajib berupa angka -90 sampai 90.`);
  if (lng === undefined || lng < -180 || lng > 180) throw new Error(`Baris ${row}: longitude wajib berupa angka -180 sampai 180.`);
  const fromServiceCenter = distanceKm(
    { lat: config.serviceLimits.centerLat, lng: config.serviceLimits.centerLng },
    { lat, lng },
  );
  if (fromServiceCenter > config.serviceLimits.radiusKm) {
    throw new Error(`Baris ${row}: lokasi berada ${fromServiceCenter.toFixed(1)} km dari pusat, di luar area layanan ${config.serviceLimits.radiusKm} km.`);
  }

  const rating = optionalNumber(record.rating, 'rating', row);
  const reviewCount = optionalNumber(record.reviewCount, 'reviewCount', row);
  if (rating !== undefined && (rating < 0 || rating > 5)) throw new Error(`Baris ${row}: rating harus 0 sampai 5.`);
  if (reviewCount !== undefined && (!Number.isSafeInteger(reviewCount) || reviewCount < 0)) throw new Error(`Baris ${row}: reviewCount harus bilangan bulat positif.`);
  const collectedAt = record.collectedAt?.trim() ? new Date(record.collectedAt) : undefined;
  if (collectedAt && Number.isNaN(collectedAt.getTime())) throw new Error(`Baris ${row}: collectedAt bukan tanggal valid.`);

  return {
    externalPlaceId: record.placeId?.trim() || undefined,
    name,
    category: record.category?.trim() || undefined,
    address: record.address?.trim() || undefined,
    lat,
    lng,
    rating,
    reviewCount,
    phone: record.phone?.trim() || undefined,
    website: record.website?.trim() || undefined,
    openingHours: record.openingHours?.trim() || undefined,
    googleMapsUrl: record.googleMapsUrl?.trim() || undefined,
    searchKeyword: record.searchKeyword?.trim() || undefined,
    searchArea: record.searchArea?.trim() || undefined,
    collectedAt,
  };
}

async function run() {
  const input = process.argv[2];
  if (!input) throw new Error('Gunakan: npm run places:import -- <path-file.csv>');
  if (!databasePool) throw new Error('DATABASE_URL wajib diisi sebelum import data.');

  const repository = new PostgisPlaceRepository(
    databasePool,
    { lat: config.serviceLimits.centerLat, lng: config.serviceLimits.centerLng },
    config.serviceLimits.radiusKm,
  );
  let inserted = 0;
  let updated = 0;
  let rowNumber = 1;
  const parser = createReadStream(path.resolve(input)).pipe(parse({ columns: true, bom: true, skip_empty_lines: true, trim: true }));

  for await (const record of parser as AsyncIterable<CsvRow>) {
    rowNumber++;
    if (rowNumber === 2) {
      const missing = expectedColumns.filter(column => !(column in record));
      if (missing.length) throw new Error(`Kolom CSV belum lengkap: ${missing.join(', ')}`);
    }
    const result = await repository.upsertSurveyPlace(toPlace(record, rowNumber));
    if (result === 'inserted') inserted++;
    else updated++;
  }
  console.log(`Import selesai: ${inserted} data baru, ${updated} data diperbarui.`);
}

run()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => databasePool?.end());
