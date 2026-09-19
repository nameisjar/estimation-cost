import type { Pool } from 'pg';
import type { GeocodedPlace, LocationPoint, MapBounds, MapPlace, PlaceRepository } from '../../types/index.js';

type PlaceRow = {
  id: string;
  name: string;
  address: string;
  category: string;
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
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    type: row.category,
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
  other: 60,
};

function ranking(place: SurveyPlaceInput) {
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
      `SELECT id, name, address, category, verified,
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
      `SELECT id, name, address, category, verified,
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
      `SELECT id, name, address, category, verified, min_zoom, label_priority,
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
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id
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
    const placeRanking = ranking(place);
    const values = [
      place.externalPlaceId?.trim() || null,
      place.name,
      place.address?.trim() || 'Alamat belum tersedia',
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
    ];
    if (existing.rows[0]) {
      await this.pool.query(
        `UPDATE places
            SET external_place_id = COALESCE($1, external_place_id),
                name = $2,
                address = $3,
                category = $4,
                aliases = $5,
                location = ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography,
                rating = $8,
                review_count = $9,
                phone = $10,
                website = $11,
                opening_hours = $12,
                google_maps_url = $13,
                search_keyword = $14,
                search_area = $15,
                collected_at = $16,
                popularity = $17,
                min_zoom = $18,
                label_priority = $19,
                source = 'antarfix_survey',
                verified = TRUE,
                active = TRUE,
                updated_at = NOW()
          WHERE id = $20`,
        [...values, existing.rows[0].id],
      );
      return 'updated';
    }
    await this.pool.query(
      `INSERT INTO places (
         external_place_id, name, address, category, aliases, location,
         rating, review_count, phone, website, opening_hours, google_maps_url,
         search_keyword, search_area, collected_at, popularity, min_zoom, label_priority
       )
       VALUES (
         $1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($7, $6), 4326)::geography,
         $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
       )`,
      values,
    );
    return 'inserted';
  }
}
