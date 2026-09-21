import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { databasePool } from '../database.js';
import { config } from '../config.js';
import { PostgisPlaceRepository } from '../services/places/postgis-place.repository.js';
import { parsePlaceCsv } from '../services/places/place-csv-import.service.js';

async function run() {
  const input = process.argv[2];
  if (!input) throw new Error('Gunakan: npm run places:import -- <path-file.csv>');
  if (!databasePool) throw new Error('DATABASE_URL wajib diisi sebelum import data.');

  const repository = new PostgisPlaceRepository(
    databasePool,
    { lat: config.serviceLimits.centerLat, lng: config.serviceLimits.centerLng },
    config.serviceLimits.radiusKm,
  );
  const parsed = parsePlaceCsv(await readFile(path.resolve(input), 'utf8'), config.serviceLimits);
  for (const issue of parsed.issues) console.warn(`Lewati baris ${issue.row}: ${issue.message}`);
  const result = await repository.importSurveyPlaces(parsed.records.map(record => record.place), 'upsert');
  const skipped = parsed.totalRows - parsed.records.length + result.skipped;
  console.log(`Import selesai: ${result.inserted} data baru, ${result.updated} data diperbarui, ${skipped} data dilewati.`);
}

run()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => databasePool?.end());
