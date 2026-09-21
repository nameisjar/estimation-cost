import type { Pool } from 'pg';
import type { PlaceCsvImportMode } from './place-csv-import.service.js';
import type { GeocodedPlace, LocationPoint, MapBounds, MapPlace, PlaceRepository } from '../../types/index.js';
import { displayPlaceAddress, isMissingAddress } from './place-address.js';
import { classifyPlace } from './place-classification.js';

type PlaceRow = {
  id: string;
  name: string;
  address: string;
  search_area: string | null;
  category: string;
  icon_type: string;
  icon_type_verified: boolean;
  search_keyword: string | null;
  lat: number | string;
  lng: number | string;
  verified: boolean;
  distance_meters?: number | string | null;
  min_zoom?: number;
  label_priority?: number;
  popularity?: number | string;
  rating?: number | string | null;
  review_count?: number | string | null;
};

export type SurveyPlaceInput = {
  externalPlaceId?: string;
  name: string;
  address?: string;
  category?: string;
  iconType?: string;
  aliases?: string[];
  lat: number;
  lng: number;
  rating?: number;
  reviewCount?: number;
  phone?: string;
  website?: string;
  openingHours?: string;
  googleMapsUrl?: string;
  searchKeyword?: string;
  searchArea?: string;
  collectedAt?: Date;
};

function asPlace(row: PlaceRow): GeocodedPlace {
  const classification = row.icon_type_verified
    ? { category: row.category, iconType: row.icon_type }
    : classifyPlace(row.name, row.category, row.search_keyword || '');
  return {
    id: row.id,
    name: row.name,
    address: displayPlaceAddress(row.address, row.search_area),
    type: classification.category,
    iconType: classification.iconType,
    lat: Number(row.lat),
    lng: Number(row.lng),
    source: 'antarfix',
    verified: row.verified,
    ...(row.distance_meters == null ? {} : { distanceMeters: Math.round(Number(row.distance_meters)) }),
  };
}

const categoryPriority: Record<string, number> = {
  medical: 340,
  transport: 300,
  government: 270,
  education: 250,
  finance: 220,
  lodging: 190,
  worship: 170,
  food: 150,
  retail: 125,
  automotive: 105,
  service: 85,
  sports: 145,
  tourism: 135,
  business: 95,
  other: 60,
};

export function rankSurveyPlace(place: SurveyPlaceInput) {
  const reviews = Math.max(place.reviewCount ?? 0, 0);
  const rating = Math.max(place.rating ?? 0, 0);
  const categoryScore = categoryPriority[place.category || 'other'] ?? categoryPriority.other!;
  const reviewScore = Math.min(Math.round(Math.log2(reviews + 1) * 16), 160);
  const ratingScore = Math.round(rating * 6);
  const labelPriority = categoryScore + reviewScore + ratingScore;
  return {
    popularity: Math.min(reviews, 100_000) + Math.round(rating * 20),
    labelPriority,
    minZoom: labelPriority >= 390 ? 16 : labelPriority >= 260 ? 17 : 18,
  };
}

export class PostgisPlaceRepository implements PlaceRepository {
  constructor(
    private readonly pool: Pool,
    private readonly serviceCenter: LocationPoint,
    private readonly serviceRadiusKm: number,
  ) {}

  async search(query: string, near?: LocationPoint, limit = 8): Promise<GeocodedPlace[]> {
    const focus = near || this.serviceCenter;
    const result = await this.pool.query<PlaceRow>(
      `SELECT id, name, address, search_area, category, icon_type, icon_type_verified, search_keyword, verified,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng,
              ST_Distance(location, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography) AS distance_meters
         FROM places
        WHERE active = TRUE
          AND (search_text % $1 OR search_text ILIKE '%' || $1 || '%')
          AND ST_DWithin(
                location,
                ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
                $4
              )
        ORDER BY
          CASE
            WHEN lower(name) = lower($1) THEN 0
            WHEN lower(name) LIKE lower($1) || '%' THEN 1
            ELSE 2
          END,
          similarity(search_text, $1) DESC,
          verified DESC,
          popularity DESC,
          distance_meters ASC
        LIMIT $5`,
      [query.trim(), focus.lat, focus.lng, this.serviceRadiusKm * 1000, Math.min(Math.max(limit, 1), 20)],
    );
    return result.rows.map(asPlace);
  }

  async nearest(point: LocationPoint, radiusMeters = 60): Promise<GeocodedPlace | null> {
    const result = await this.pool.query<PlaceRow>(
      `SELECT id, name, address, search_area, category, icon_type, icon_type_verified, search_keyword, verified,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng,
              ST_Distance(location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_meters
         FROM places
        WHERE active = TRUE
          AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
        ORDER BY distance_meters ASC, verified DESC, popularity DESC
        LIMIT 1`,
      [point.lat, point.lng, radiusMeters],
    );
    return result.rows[0] ? asPlace(result.rows[0]) : null;
  }

  async inBounds(bounds: MapBounds, zoom: number, limit = 100): Promise<MapPlace[]> {
    const result = await this.pool.query<PlaceRow>(
      `SELECT id, name, address, search_area, category, icon_type, icon_type_verified, search_keyword, verified, min_zoom, label_priority,
              popularity, rating, review_count,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng
         FROM places
        WHERE active = TRUE
          AND min_zoom <= $5
          AND ST_Intersects(
                location,
                ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography
              )
        ORDER BY label_priority DESC, verified DESC, popularity DESC, name ASC
        LIMIT $6`,
      [bounds.west, bounds.south, bounds.east, bounds.north, zoom, Math.min(Math.max(limit, 1), 200)],
    );
    return result.rows.map(row => ({
      ...asPlace(row),
      id: row.id,
      minZoom: row.min_zoom ?? 16,
      labelPriority: row.label_priority ?? 0,
      popularity: Number(row.popularity ?? 0),
      ...(row.rating == null ? {} : { rating: Number(row.rating) }),
      ...(row.review_count == null ? {} : { reviewCount: Number(row.review_count) }),
    }));
  }

  async upsertSurveyPlace(place: SurveyPlaceInput): Promise<'inserted' | 'updated'> {
    const existing = await this.pool.query<{ id: string; rating: number | string | null; review_count: number | string | null }>(
      `SELECT id, rating, review_count
         FROM places
        WHERE ($1::text IS NOT NULL AND external_place_id = $1)
           OR (
                lower(name) = lower($2)
                AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, 20)
              )
        ORDER BY
          CASE WHEN external_place_id = $1 THEN 0 ELSE 1 END,
          ST_Distance(location, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography)
        LIMIT 1`,
      [place.externalPlaceId || null, place.name, place.lat, place.lng],
    );
    const existingRow = existing.rows[0];
    const placeRanking = rankSurveyPlace({
      ...place,
      rating: place.rating ?? (existingRow?.rating == null ? undefined : Number(existingRow.rating)),
      reviewCount: place.reviewCount ?? (existingRow?.review_count == null ? undefined : Number(existingRow.review_count)),
    });
    const storedAddress = place.address?.trim() || 'Alamat belum tersedia';
    const importedAddressSource = isMissingAddress(storedAddress) ? 'missing' : 'survey';
    const values = [
      place.externalPlaceId?.trim() || null,
      place.name,
      storedAddress,
      place.category?.trim() || 'other',
      place.aliases || [],
      place.lat,
      place.lng,
      place.rating ?? null,
      place.reviewCount ?? null,
      place.phone?.trim() || null,
      place.website?.trim() || null,
      place.openingHours?.trim() || null,
      place.googleMapsUrl?.trim() || null,
      place.searchKeyword?.trim() || null,
      place.searchArea?.trim() || null,
      place.collectedAt || null,
      placeRanking.popularity,
      placeRanking.minZoom,
      placeRanking.labelPriority,
      importedAddressSource,
      place.iconType?.trim() || place.category?.trim() || 'other',
    ];
    if (existingRow) {
      await this.pool.query(
        `UPDATE places
            SET external_place_id = COALESCE(external_place_id, $1),
                name = $2,
                address = CASE
                  WHEN address_source = 'manual' OR ($20 = 'missing' AND address_source <> 'missing') THEN address
                  ELSE $3
                END,
                address_source = CASE
                  WHEN address_source = 'manual' OR ($20 = 'missing' AND address_source <> 'missing') THEN address_source
                  ELSE $20
                END,
                address_verified = CASE
                  WHEN address_source = 'manual' OR ($20 = 'missing' AND address_source <> 'missing') THEN address_verified
                  ELSE FALSE
                END,
                address_updated_at = CASE
                  WHEN address_source = 'manual' OR ($20 = 'missing' AND address_source <> 'missing') THEN address_updated_at
                  WHEN $20 = 'missing' THEN NULL
                  ELSE NOW()
                END,
                category = $4,
                icon_type = CASE WHEN icon_type_verified THEN icon_type ELSE $21 END,
                aliases = CASE WHEN cardinality($5::text[]) > 0 THEN $5 ELSE aliases END,
                location = ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography,
                rating = COALESCE($8, rating),
                review_count = COALESCE($9, review_count),
                phone = COALESCE($10, phone),
                website = COALESCE($11, website),
                opening_hours = COALESCE($12, opening_hours),
                google_maps_url = COALESCE($13, google_maps_url),
                search_keyword = COALESCE($14, search_keyword),
                search_area = COALESCE($15, search_area),
                collected_at = COALESCE($16, collected_at),
                popularity = $17,
                min_zoom = $18,
                label_priority = $19,
                source = CASE WHEN source = 'admin' THEN source ELSE 'antarfix_survey' END,
                verified = TRUE,
                updated_at = NOW()
          WHERE id = $22`,
        [...values, existingRow.id],
      );
      return 'updated';
    }
    await this.pool.query(
      `INSERT INTO places (
         external_place_id, name, address, category, aliases, location,
         rating, review_count, phone, website, opening_hours, google_maps_url,
         search_keyword, search_area, collected_at, popularity, min_zoom, label_priority,
         address_source, address_verified, address_updated_at, icon_type, icon_type_verified
       )
       VALUES (
         $1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography,
         $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
         $20, FALSE, CASE WHEN $20 = 'missing' THEN NULL ELSE NOW() END, $21, FALSE
       )`,
      values,
    );
    return 'inserted';
  }

  async classifySurveyPlace(place: SurveyPlaceInput): Promise<'inserted' | 'updated'> {
    const result = await this.pool.query(
      `SELECT 1
         FROM places
        WHERE ($1::text IS NOT NULL AND external_place_id = $1)
           OR (
                lower(name) = lower($2)
                AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, 20)
              )
        LIMIT 1`,
      [place.externalPlaceId || null, place.name, place.lat, place.lng],
    );
    return result.rowCount ? 'updated' : 'inserted';
  }

  async importSurveyPlaces(
    places: SurveyPlaceInput[],
    mode: PlaceCsvImportMode,
  ): Promise<{ inserted: number; updated: number; skipped: number }> {
    const client = await this.pool.connect();
    const transactional = new PostgisPlaceRepository(client as unknown as Pool, this.serviceCenter, this.serviceRadiusKm);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    try {
      await client.query('BEGIN');
      for (const place of places) {
        if (mode === 'insert-only' && await transactional.classifySurveyPlace(place) === 'updated') {
          skipped++;
          continue;
        }
        const result = await transactional.upsertSurveyPlace(place);
        if (result === 'inserted') inserted++;
        else updated++;
      }
      await client.query('COMMIT');
      return { inserted, updated, skipped };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
