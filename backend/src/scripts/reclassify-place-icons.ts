import 'dotenv/config';
import { databasePool } from '../database.js';
import { classifyPlace } from '../services/places/place-classification.js';

async function run() {
  if (!databasePool) throw new Error('DATABASE_URL wajib diisi sebelum mengklasifikasi ikon.');
  const client = await databasePool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string; name: string; category: string; search_keyword: string | null }>(
      `SELECT id, name, category, search_keyword
         FROM places
        WHERE NOT icon_type_verified
        ORDER BY id
        FOR UPDATE`,
    );
    let changed = 0;
    for (const place of result.rows) {
      const classification = classifyPlace(place.name, place.category, place.search_keyword || '');
      const update = await client.query(
        `UPDATE places
            SET category=$1, icon_type=$2, updated_at=NOW()
          WHERE id=$3
            AND NOT icon_type_verified
            AND (category <> $1 OR icon_type <> $2)`,
        [classification.category, classification.iconType, place.id],
      );
      changed += update.rowCount || 0;
    }
    await client.query('COMMIT');
    console.log(`Klasifikasi ikon selesai: ${result.rowCount} tempat diperiksa, ${changed} diperbarui.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

run()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => databasePool?.end());
