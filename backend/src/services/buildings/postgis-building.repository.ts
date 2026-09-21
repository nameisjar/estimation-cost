import type { Pool } from 'pg';
import type { BuildingFootprint, BuildingRepository, LocationPoint, PlaceAreaGeometry } from '../../types/index.js';

type BuildingRow = {
  source_id: string;
  kind: 'building' | 'area';
  name: string | null;
  address: string | null;
  building_type: string;
  geometry: PlaceAreaGeometry | string;
  distance_meters: number | string;
};

function parseGeometry(value: BuildingRow['geometry']): PlaceAreaGeometry {
  return typeof value === 'string' ? JSON.parse(value) as PlaceAreaGeometry : value;
}

export class PostgisBuildingRepository implements BuildingRepository {
  constructor(private readonly pool: Pool) {}

  async findAt(point: LocationPoint): Promise<BuildingFootprint | null> {
    const result = await this.pool.query<BuildingRow>(
      `WITH target AS (
         SELECT ST_SetSRID(ST_MakePoint($2, $1), 4326) AS geometry
       ), candidates AS (
         SELECT building_footprints.source_id, building_footprints.name,
                building_footprints.address, building_footprints.building_type AS feature_type,
                building_footprints.geometry, 'building'::text AS kind, 0 AS kind_priority
           FROM building_footprints, target
          WHERE ST_Covers(building_footprints.geometry, target.geometry)
         UNION ALL
         SELECT osm_areas.source_id, osm_areas.name, osm_areas.address,
                osm_areas.area_type AS feature_type,
                osm_areas.geometry, 'area'::text AS kind, 1 AS kind_priority
           FROM osm_areas, target
          WHERE ST_Covers(osm_areas.geometry, target.geometry)
       )
       SELECT candidates.source_id, candidates.kind,
              COALESCE(NULLIF(candidates.name, ''), contained_place.name, contained_osm_poi.name) AS name,
              COALESCE(
                NULLIF(candidates.address, ''),
                NULLIF(contained_place.address, 'Alamat belum tersedia'),
                NULLIF(contained_osm_poi.address, '')
              ) AS address,
              candidates.feature_type AS building_type,
              ST_AsGeoJSON(candidates.geometry)::json AS geometry,
              0 AS distance_meters
         FROM candidates
         CROSS JOIN target
         LEFT JOIN LATERAL (
           SELECT places.name, places.address
             FROM places
            WHERE places.active = TRUE
              AND ST_Covers(candidates.geometry, places.location::geometry)
            ORDER BY
              places.verified DESC,
              ST_Distance(places.location::geometry, target.geometry) ASC,
              places.popularity DESC,
              places.name ASC
            LIMIT 1
         ) AS contained_place ON TRUE
         LEFT JOIN LATERAL (
           SELECT osm_pois.name, osm_pois.address
             FROM osm_pois
            WHERE ST_Covers(candidates.geometry, osm_pois.location)
            ORDER BY ST_Distance(osm_pois.location, target.geometry) ASC, osm_pois.name ASC
            LIMIT 1
         ) AS contained_osm_poi ON TRUE
        ORDER BY
          candidates.kind_priority ASC,
          ST_Area(candidates.geometry::geography) ASC
        LIMIT 1`,
      [point.lat, point.lng],
    );
    const row = result.rows[0];
    return row ? {
      id: row.source_id,
      kind: row.kind,
      name: row.name || undefined,
      address: row.address || undefined,
      buildingType: row.building_type,
      geometry: parseGeometry(row.geometry),
      distanceMeters: Math.round(Number(row.distance_meters)),
    } : null;
  }
}
