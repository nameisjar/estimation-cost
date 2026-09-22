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
      `WITH target AS MATERIALIZED (
         SELECT ST_SetSRID(ST_MakePoint($2, $1), 4326) AS geometry
       ), candidates AS MATERIALIZED (
         SELECT building_footprints.source_id, building_footprints.name,
                building_footprints.address, building_footprints.building_type AS feature_type,
                building_footprints.geometry, 'building'::text AS kind, 0 AS kind_priority
           FROM building_footprints, target
          WHERE building_footprints.geometry && target.geometry
            AND ST_Covers(building_footprints.geometry, target.geometry)
         UNION ALL
         SELECT osm_areas.source_id, osm_areas.name, osm_areas.address,
                osm_areas.area_type AS feature_type,
                osm_areas.geometry, 'area'::text AS kind, 1 AS kind_priority
           FROM osm_areas, target
          WHERE osm_areas.geometry && target.geometry
            AND ST_Covers(osm_areas.geometry, target.geometry)
       ), selected AS MATERIALIZED (
         SELECT candidates.*
           FROM candidates
          ORDER BY candidates.kind_priority ASC, ST_Area(candidates.geometry) ASC
          LIMIT 1
       )
       SELECT selected.source_id, selected.kind,
              COALESCE(NULLIF(selected.name, ''), contained_place.name, contained_osm_poi.name) AS name,
              COALESCE(
                NULLIF(selected.address, ''),
                NULLIF(contained_place.address, 'Alamat belum tersedia'),
                NULLIF(contained_osm_poi.address, '')
              ) AS address,
              selected.feature_type AS building_type,
              ST_AsGeoJSON(selected.geometry)::json AS geometry,
              0 AS distance_meters
         FROM selected
         CROSS JOIN target
         LEFT JOIN LATERAL (
           SELECT places.name, places.address
             FROM places
            WHERE places.active = TRUE
              AND places.location::geometry && selected.geometry
              AND ST_Covers(selected.geometry, places.location::geometry)
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
            WHERE selected.geometry && osm_pois.location
              AND ST_Covers(selected.geometry, osm_pois.location)
            ORDER BY ST_Distance(osm_pois.location, target.geometry) ASC, osm_pois.name ASC
            LIMIT 1
         ) AS contained_osm_poi ON TRUE
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
