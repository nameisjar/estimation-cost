import 'dotenv/config';
import { databasePool } from '../database.js';
import { config } from '../config.js';
import { NominatimProvider } from '../services/geocoding/nominatim.provider.js';
import { AdminPlaceRepository } from '../services/places/admin-place.repository.js';

type MissingPlaceRow = { id: string; name: string; lat: number | string; lng: number | string };

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find(value => value.startsWith(prefix))?.slice(prefix.length);
}

function limit(): number {
  const parsed = Number(argument('limit') || 25);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error('--limit harus berupa bilangan bulat 1 sampai 500.');
  }
  if (config.geocodingBaseUrl === 'https://nominatim.openstreetmap.org' && parsed > 50) {
    throw new Error('Untuk Nominatim publik, jalankan maksimal 50 data per batch. Gunakan provider/instance sendiri untuk batch lebih besar.');
  }
  return parsed;
}

async function run() {
  if (!databasePool) throw new Error('DATABASE_URL wajib diisi sebelum pengayaan alamat.');
  const batchLimit = limit();
  const onlyId = argument('id');
  const result = await databasePool.query<MissingPlaceRow>(
    `SELECT id, name, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM places
      WHERE address_source = 'missing'
        AND ($1::uuid IS NULL OR id = $1)
      ORDER BY updated_at ASC
      LIMIT $2`,
    [onlyId || null, batchLimit],
  );
  if (!result.rowCount) {
    console.log('Tidak ada alamat yang perlu diperkaya.');
    return;
  }

  if (config.geocodingBaseUrl === 'https://nominatim.openstreetmap.org') {
    console.warn('Memakai Nominatim publik secara berurutan (maksimal 1 request/detik). Hasil langsung disimpan agar tidak diminta ulang.');
  }
  const provider = new NominatimProvider(
    config.geocodingBaseUrl,
    config.geocodingTimeoutMs,
    config.geocodingUserAgent,
    config.frontendUrl,
    { minimumIntervalMs: 1100, serviceLimits: config.serviceLimits, searchRadiusKm: config.geocodingSearchRadiusKm },
  );
  const repository = new AdminPlaceRepository(databasePool);
  let updated = 0;
  let unresolved = 0;
  let failed = 0;

  for (const row of result.rows) {
    try {
      const place = await provider.reverse({ lat: Number(row.lat), lng: Number(row.lng) });
      if (!place?.address) {
        unresolved++;
        console.warn(`Belum ditemukan: ${row.name}`);
        continue;
      }
      await repository.saveAutomaticAddress(row.id, place.address);
      updated++;
      console.log(`[${updated + unresolved + failed}/${result.rows.length}] ${row.name} -> ${place.address}`);
    } catch (error) {
      failed++;
      console.warn(`Gagal ${row.name}: ${error instanceof Error ? error.message : 'kesalahan tidak dikenal'}`);
    }
  }
  console.log(`Pengayaan selesai: ${updated} alamat tersimpan, ${unresolved} belum ditemukan, ${failed} gagal.`);
}

run()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => databasePool?.end());
