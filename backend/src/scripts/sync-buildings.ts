import 'dotenv/config';
import { Pool } from 'pg';
import { config } from '../config.js';
import {
  normalizeBuildingElement,
  normalizeAreaElement,
  normalizePoiElement,
  type AreaImportRecord,
  type BuildingImportRecord,
  type OverpassElement,
  type PoiImportRecord,
} from './building-import-utils.js';

function numericArgument(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find(argument => argument.startsWith(prefix))?.slice(prefix.length);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} harus berupa angka positif.`);
  return value;
}

function bounds(lat: number, lng: number, radiusKm: number) {
  const latitudeDelta = radiusKm / 111.32;
  const longitudeDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
  return {
    south: lat - latitudeDelta,
    west: lng - longitudeDelta,
    north: lat + latitudeDelta,
    east: lng + longitudeDelta,
  };
}

async function upsertBatch(pool: Pool, records: BuildingImportRecord[]): Promise<number> {
  const result = await pool.query(
    `WITH input AS (
       SELECT source_id, name, address, building_type, source_updated_at,
              ST_Multi(ST_CollectionExtract(ST_MakeValid(
                ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)
              ), 3)) AS geometry
         FROM jsonb_to_recordset($1::jsonb) AS value(
           source_id text, name text, address text, building_type text, geometry jsonb, source_updated_at timestamptz
         )
     )
     INSERT INTO building_footprints (source_id, name, address, building_type, geometry, source_updated_at)
     SELECT source_id, name, address, building_type, geometry, source_updated_at
       FROM input
      WHERE NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)
     ON CONFLICT (source_id) DO UPDATE SET
       name = EXCLUDED.name,
       address = EXCLUDED.address,
       building_type = EXCLUDED.building_type,
       geometry = EXCLUDED.geometry,
       source_updated_at = EXCLUDED.source_updated_at,
       updated_at = now()`,
    [JSON.stringify(records.map(record => ({
      source_id: record.sourceId,
      name: record.name,
      address: record.address,
      building_type: record.buildingType,
      geometry: record.geometry,
      source_updated_at: record.sourceUpdatedAt,
    })))],
  );
  return result.rowCount || 0;
}

async function upsertPoiBatch(pool: Pool, records: PoiImportRecord[]): Promise<number> {
  const result = await pool.query(
    `INSERT INTO osm_pois (source_id, name, category, address, location, source_updated_at)
     SELECT source_id, name, category, address,
            ST_SetSRID(ST_MakePoint(lng, lat), 4326), source_updated_at
       FROM jsonb_to_recordset($1::jsonb) AS value(
         source_id text, name text, category text, address text,
         lat double precision, lng double precision, source_updated_at timestamptz
       )
     ON CONFLICT (source_id) DO UPDATE SET
       name = EXCLUDED.name,
       category = EXCLUDED.category,
       address = EXCLUDED.address,
       location = EXCLUDED.location,
       source_updated_at = EXCLUDED.source_updated_at,
       updated_at = now()`,
    [JSON.stringify(records.map(record => ({
      source_id: record.sourceId,
      name: record.name,
      category: record.category,
      address: record.address,
      lat: record.lat,
      lng: record.lng,
      source_updated_at: record.sourceUpdatedAt,
    })))],
  );
  return result.rowCount || 0;
}

async function upsertAreaBatch(pool: Pool, records: AreaImportRecord[]): Promise<number> {
  const result = await pool.query(
    `WITH input AS (
       SELECT source_id, name, address, area_type, source_updated_at,
              ST_Multi(ST_CollectionExtract(ST_MakeValid(
                ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326)
              ), 3)) AS geometry
         FROM jsonb_to_recordset($1::jsonb) AS value(
           source_id text, name text, address text, area_type text,
           geometry jsonb, source_updated_at timestamptz
         )
     )
     INSERT INTO osm_areas (source_id, name, address, area_type, geometry, source_updated_at)
     SELECT source_id, name, address, area_type, geometry, source_updated_at
       FROM input
      WHERE NOT ST_IsEmpty(geometry) AND ST_IsValid(geometry)
     ON CONFLICT (source_id) DO UPDATE SET
       name = EXCLUDED.name,
       address = EXCLUDED.address,
       area_type = EXCLUDED.area_type,
       geometry = EXCLUDED.geometry,
       source_updated_at = EXCLUDED.source_updated_at,
       updated_at = now()`,
    [JSON.stringify(records.map(record => ({
      source_id: record.sourceId,
      name: record.name,
      address: record.address,
      area_type: record.areaType,
      geometry: record.geometry,
      source_updated_at: record.sourceUpdatedAt,
    })))],
  );
  return result.rowCount || 0;
}

function uniqueBySource<T extends { sourceId: string }>(records: T[]): T[] {
  return [...new Map(records.map(record => [record.sourceId, record])).values()];
}

const databaseUrl = config.databaseUrl;
if (!databaseUrl) throw new Error('DATABASE_URL wajib diisi sebelum sinkronisasi bangunan.');
const radiusKm = Math.min(numericArgument('radius-km', Math.min(config.serviceLimits.radiusKm, 3)), config.serviceLimits.radiusKm);
const configuredEndpoint = process.env.OVERPASS_BASE_URL?.trim();
const endpoints = configuredEndpoint
  ? [configuredEndpoint]
  : ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const area = bounds(config.serviceLimits.centerLat, config.serviceLimits.centerLng, radiusKm);
const bbox = `${area.south},${area.west},${area.north},${area.east}`;
const buildingAndPoiQuery = `[out:json][timeout:180][maxsize:536870912];
(way["building"]["building"!="no"](${bbox});relation["building"]["building"!="no"](${bbox});)->.buildings;
(nwr["name"]["office"](${bbox});nwr["name"]["shop"](${bbox});nwr["name"]["amenity"](${bbox});nwr["name"]["tourism"](${bbox});nwr["name"]["healthcare"](${bbox});nwr["name"]["craft"](${bbox});nwr["name"]["leisure"](${bbox});nwr["name"]["historic"](${bbox});nwr["name"]["public_transport"](${bbox});nwr["name"]["railway"](${bbox});)->.pois;
.buildings out meta geom;
.pois out meta center;`;
const areaQuery = `[out:json][timeout:120][maxsize:134217728];
(way["leisure"~"^(pitch|park|sports_centre|stadium|playground|swimming_pool)$"](${bbox});relation["leisure"~"^(pitch|park|sports_centre|stadium|playground|swimming_pool)$"](${bbox});way["landuse"~"^(recreation_ground|cemetery|retail|commercial|education|institutional)$"](${bbox});relation["landuse"~"^(recreation_ground|cemetery|retail|commercial|education|institutional)$"](${bbox});way["amenity"~"^(school|university|college|kindergarten|hospital|clinic|marketplace|parking|place_of_worship)$"](${bbox});relation["amenity"~"^(school|university|college|kindergarten|hospital|clinic|marketplace|parking|place_of_worship)$"](${bbox});way["tourism"~"^(attraction|hotel|museum)$"](${bbox});relation["tourism"~"^(attraction|hotel|museum)$"](${bbox}););
out meta geom;`;

async function fetchOverpass(query: string, label: string): Promise<OverpassElement[]> {
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': config.geocodingUserAgent },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!response.ok) {
        console.warn(`Overpass ${endpoint} gagal untuk ${label} (${response.status} ${response.statusText}); mencoba server berikutnya.`);
        continue;
      }
      const payload = await response.json() as { elements?: OverpassElement[] };
      return payload.elements || [];
    } catch (error) {
      console.warn(`Overpass ${endpoint} gagal untuk ${label}; mencoba server berikutnya.`, error instanceof Error ? error.message : error);
    }
  }
  throw new Error(`Semua server Overpass gagal mengirim ${label}.`);
}

console.log(`Mengambil data lokasi radius ${radiusKm} km dari pusat area layanan...`);
const elements = [
  ...await fetchOverpass(buildingAndPoiQuery, 'bangunan dan POI'),
  ...await fetchOverpass(areaQuery, 'area fasilitas'),
];
const records = uniqueBySource(elements.map(normalizeBuildingElement).filter((value): value is BuildingImportRecord => !!value));
const areaRecords = uniqueBySource(elements.map(normalizeAreaElement).filter((value): value is AreaImportRecord => !!value));
const poiRecords = uniqueBySource(elements.map(normalizePoiElement).filter((value): value is PoiImportRecord => !!value));
if (!records.length) throw new Error('Tidak ada poligon bangunan valid yang diterima dari Overpass.');

const pool = new Pool({ connectionString: databaseUrl, max: 2 });
let imported = 0;
let importedAreas = 0;
let importedPois = 0;
try {
  for (let index = 0; index < records.length; index += 500) imported += await upsertBatch(pool, records.slice(index, index + 500));
  for (let index = 0; index < areaRecords.length; index += 500) importedAreas += await upsertAreaBatch(pool, areaRecords.slice(index, index + 500));
  for (let index = 0; index < poiRecords.length; index += 500) importedPois += await upsertPoiBatch(pool, poiRecords.slice(index, index + 500));
} finally {
  await pool.end();
}
console.log(`Sinkronisasi selesai: ${imported} bangunan, ${importedAreas} area fasilitas, dan ${importedPois} POI bernama disimpan.`);
