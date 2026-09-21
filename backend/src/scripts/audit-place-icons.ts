import 'dotenv/config';
import { databasePool } from '../database.js';
import { classifyPlace } from '../services/places/place-classification.js';

type PlaceForIconAudit = {
  name: string;
  category: string;
  icon_type: string;
  icon_type_verified: boolean;
  search_keyword: string | null;
};

async function run() {
  if (!databasePool) throw new Error('DATABASE_URL wajib diisi sebelum mengaudit ikon.');
  const result = await databasePool.query<PlaceForIconAudit>(
    `SELECT name, category, icon_type, icon_type_verified, search_keyword
       FROM places
      WHERE active = TRUE
      ORDER BY popularity DESC, name ASC`,
  );
  const totals = new Map<string, number>();
  const unresolved: string[] = [];
  const unresolvedKeywords = new Map<string, number>();
  let protectedByAdmin = 0;
  let storedAsOther = 0;
  let storedMismatch = 0;
  for (const place of result.rows) {
    if (place.icon_type === 'other') storedAsOther++;
    const classification = place.icon_type_verified
      ? { category: place.category, iconType: place.icon_type }
      : classifyPlace(place.name, place.category, place.search_keyword || '');
    totals.set(classification.iconType, (totals.get(classification.iconType) || 0) + 1);
    if (place.icon_type_verified) protectedByAdmin++;
    else if (place.icon_type !== classification.iconType || place.category !== classification.category) storedMismatch++;
    if (!place.icon_type_verified && classification.iconType === 'other') {
      unresolved.push(place.name);
      const keyword = place.search_keyword?.trim() || '(tanpa kata kunci)';
      unresolvedKeywords.set(keyword, (unresolvedKeywords.get(keyword) || 0) + 1);
    }
  }
  console.log(`Audit ikon: ${result.rowCount} tempat aktif, ${protectedByAdmin} pilihan admin dilindungi.`);
  console.log(`Tersimpan sebagai ikon umum: ${storedAsOther}.`);
  console.log(`Berbeda dari klasifikasi terbaru: ${storedMismatch}.`);
  console.table([...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([iconType, total]) => ({ iconType, total })));
  console.log(`Belum dikenali otomatis: ${unresolved.length}.`);
  if (unresolvedKeywords.size) {
    console.table([...unresolvedKeywords.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 200)
      .map(([searchKeyword, total]) => ({ searchKeyword, total })));
  }
  if (unresolved.length) console.log(unresolved.slice(0, 100).join('\n'));
}

run()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => databasePool?.end());
