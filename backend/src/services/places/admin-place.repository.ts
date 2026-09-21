import type { Pool } from 'pg';
import { ApiError } from '../../errors.js';
import { rankSurveyPlace, type SurveyPlaceInput } from './postgis-place.repository.js';
import { addressSourceForInput, displayPlaceAddress, missingAddress, type PlaceAddressSource } from './place-address.js';

export type AdminPlace = {
  id: string;
  externalPlaceId: string | null;
  name: string;
  category: string;
  iconType: string;
  iconTypeVerified: boolean;
  address: string;
  displayAddress: string;
  addressSource: PlaceAddressSource;
  addressVerified: boolean;
  lat: number;
  lng: number;
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  website: string | null;
  openingHours: string | null;
  googleMapsUrl: string | null;
  searchKeyword: string | null;
  searchArea: string | null;
  active: boolean;
  verified: boolean;
  minZoom: number;
  labelPriority: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminPlaceInput = SurveyPlaceInput & { active: boolean };
export type AdminPlaceList = { items: AdminPlace[]; total: number; page: number; limit: number };
export type AdminPlaceStats = { total: number; active: number; inactive: number; missingAddress: number };

type AdminPlaceRow = {
  id: string;
  external_place_id: string | null;
  name: string;
  category: string;
  icon_type: string;
  icon_type_verified: boolean;
  address: string;
  address_source: PlaceAddressSource;
  address_verified: boolean;
  lat: number | string;
  lng: number | string;
  rating: number | string | null;
  review_count: number | string | null;
  phone: string | null;
  website: string | null;
  opening_hours: string | null;
  google_maps_url: string | null;
  search_keyword: string | null;
  search_area: string | null;
  active: boolean;
  verified: boolean;
  min_zoom: number;
  label_priority: number;
  created_at: Date | string;
  updated_at: Date | string;
  total_count?: number | string;
};

const selectColumns = `id, external_place_id, name, category, icon_type, icon_type_verified, address, address_source, address_verified,
  ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
  rating, review_count, phone, website, opening_hours, google_maps_url,
  search_keyword, search_area, active, verified, min_zoom, label_priority,
  created_at, updated_at`;

function asAdminPlace(row: AdminPlaceRow): AdminPlace {
  return {
    id: row.id,
    externalPlaceId: row.external_place_id,
    name: row.name,
    category: row.category,
    iconType: row.icon_type,
    iconTypeVerified: row.icon_type_verified,
    address: row.address,
    displayAddress: displayPlaceAddress(row.address, row.search_area),
    addressSource: row.address_source,
    addressVerified: row.address_verified,
    lat: Number(row.lat),
    lng: Number(row.lng),
    rating: row.rating == null ? null : Number(row.rating),
    reviewCount: row.review_count == null ? null : Number(row.review_count),
    phone: row.phone,
    website: row.website,
    openingHours: row.opening_hours,
    googleMapsUrl: row.google_maps_url,
    searchKeyword: row.search_keyword,
    searchArea: row.search_area,
    active: row.active,
    verified: row.verified,
    minZoom: row.min_zoom,
    labelPriority: row.label_priority,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export class AdminPlaceRepository {
  constructor(private readonly pool: Pool) {}

  async list(
    query: string,
    status: 'all' | 'active' | 'inactive',
    addressStatus: 'all' | 'missing' | 'automatic' | 'verified' | 'survey',
    page: number,
    limit: number,
  ): Promise<AdminPlaceList> {
    const result = await this.pool.query<AdminPlaceRow>(
      `SELECT ${selectColumns}, count(*) OVER() AS total_count
         FROM places
        WHERE ($1 = '' OR search_text ILIKE '%' || lower(unaccent($1)) || '%')
          AND ($2 = 'all' OR active = ($2 = 'active'))
          AND ($3 = 'all'
            OR ($3 = 'verified' AND address_verified)
            OR ($3 = 'missing' AND address_source = 'missing')
            OR ($3 = 'automatic' AND address_source = 'automatic' AND NOT address_verified)
            OR ($3 = 'survey' AND address_source = 'survey' AND NOT address_verified))
        ORDER BY updated_at DESC, name ASC
        LIMIT $4 OFFSET $5`,
      [query, status, addressStatus, limit, (page - 1) * limit],
    );
    return {
      items: result.rows.map(asAdminPlace),
      total: Number(result.rows[0]?.total_count ?? 0),
      page,
      limit,
    };
  }

  async stats(): Promise<AdminPlaceStats> {
    const result = await this.pool.query<{
      total: number | string; active: number | string; inactive: number | string; missing_address: number | string;
    }>(`SELECT count(*) AS total,
               count(*) FILTER (WHERE active) AS active,
               count(*) FILTER (WHERE NOT active) AS inactive,
               count(*) FILTER (WHERE address_source = 'missing') AS missing_address
          FROM places`);
    const row = result.rows[0]!;
    return { total: Number(row.total), active: Number(row.active), inactive: Number(row.inactive), missingAddress: Number(row.missing_address) };
  }

  async find(id: string): Promise<AdminPlace | null> {
    const result = await this.pool.query<AdminPlaceRow>(`SELECT ${selectColumns} FROM places WHERE id = $1`, [id]);
    return result.rows[0] ? asAdminPlace(result.rows[0]) : null;
  }

  private async assertNoDuplicate(place: AdminPlaceInput, excludedId?: string) {
    const result = await this.pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM places
        WHERE lower(name) = lower($1)
          AND ($4::uuid IS NULL OR id <> $4)
          AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, 20)
        LIMIT 1`,
      [place.name, place.lat, place.lng, excludedId || null],
    );
    if (result.rows[0]) throw new ApiError(409, 'DUPLICATE_PLACE', `Tempat serupa sudah terdaftar: ${result.rows[0].name}.`);
  }

  async create(place: AdminPlaceInput): Promise<AdminPlace> {
    await this.assertNoDuplicate(place);
    const rank = rankSurveyPlace(place);
    const storedAddress = place.address?.trim() || missingAddress;
    const addressSource = addressSourceForInput(storedAddress);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO places (
         name, category, address, location, rating, review_count, phone, website,
         opening_hours, google_maps_url, search_keyword, search_area, source,
         verified, active, popularity, min_zoom, label_priority,
         address_source, address_verified, address_updated_at, icon_type, icon_type_verified
       ) VALUES (
         $1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography,
         $6, $7, $8, $9, $10, $11, $12, $13, 'admin', TRUE, $14, $15, $16, $17,
         $18, $18 = 'manual', CASE WHEN $18 = 'missing' THEN NULL ELSE NOW() END,
         $19, TRUE
       ) RETURNING id`,
      [place.name, place.category, storedAddress, place.lat, place.lng,
        place.rating ?? null, place.reviewCount ?? null, place.phone || null, place.website || null,
        place.openingHours || null, place.googleMapsUrl || null, place.searchKeyword || null,
        place.searchArea || null, place.active, rank.popularity, rank.minZoom, rank.labelPriority, addressSource,
        place.iconType || place.category || 'other'],
    );
    return (await this.find(result.rows[0]!.id))!;
  }

  async update(id: string, place: AdminPlaceInput): Promise<AdminPlace> {
    await this.assertNoDuplicate(place, id);
    const rank = rankSurveyPlace(place);
    const storedAddress = place.address?.trim() || missingAddress;
    const addressSource = addressSourceForInput(storedAddress);
    const result = await this.pool.query(
      `UPDATE places SET
         name=$1, category=$2, address=$3,
         location=ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography,
         rating=$6, review_count=$7, phone=$8, website=$9, opening_hours=$10,
         google_maps_url=$11, search_keyword=$12, search_area=$13, active=$14,
         popularity=$15, min_zoom=$16, label_priority=$17,
         address_source=$18, address_verified=($18 = 'manual'),
         address_updated_at=CASE WHEN $18 = 'missing' THEN NULL ELSE NOW() END,
         icon_type=$19, icon_type_verified=TRUE,
         verified=TRUE, updated_at=NOW()
       WHERE id=$20`,
      [place.name, place.category, storedAddress, place.lat, place.lng,
        place.rating ?? null, place.reviewCount ?? null, place.phone || null, place.website || null,
        place.openingHours || null, place.googleMapsUrl || null, place.searchKeyword || null,
        place.searchArea || null, place.active, rank.popularity, rank.minZoom, rank.labelPriority, addressSource,
        place.iconType || place.category || 'other', id],
    );
    if (!result.rowCount) throw new ApiError(404, 'PLACE_NOT_FOUND', 'Tempat tidak ditemukan.');
    return (await this.find(id))!;
  }

  async setActive(id: string, active: boolean): Promise<AdminPlace> {
    const result = await this.pool.query('UPDATE places SET active=$1, updated_at=NOW() WHERE id=$2', [active, id]);
    if (!result.rowCount) throw new ApiError(404, 'PLACE_NOT_FOUND', 'Tempat tidak ditemukan.');
    return (await this.find(id))!;
  }

  async saveAutomaticAddress(id: string, address: string): Promise<AdminPlace> {
    const result = await this.pool.query(
      `UPDATE places
          SET address=$1, address_source='automatic', address_verified=FALSE,
              address_updated_at=NOW(), updated_at=NOW()
        WHERE id=$2 AND address_source='missing'`,
      [address.trim(), id],
    );
    if (!result.rowCount) throw new ApiError(409, 'ADDRESS_ALREADY_AVAILABLE', 'Alamat tempat sudah tersedia atau telah diperbarui.');
    return (await this.find(id))!;
  }
}
