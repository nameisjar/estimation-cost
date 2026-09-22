import type { Pool } from 'pg';
import type { GeocodedPlace, GeocodingProvider, LocationPoint } from '../../types/index.js';

type CachedRow = { payload: GeocodedPlace | null };

export class PersistentReverseGeocodingProvider implements GeocodingProvider {
  private readonly inFlight = new Map<string, Promise<GeocodedPlace | null>>();
  private nextCleanupAt = 0;

  constructor(
    private readonly pool: Pool,
    private readonly fallback: GeocodingProvider,
    private readonly ttlMs = 30 * 24 * 60 * 60 * 1000,
  ) {}

  private cacheKey(point: LocationPoint, includeGeometry: boolean): string {
    return `reverse:${includeGeometry ? 'geometry' : 'address'}:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
  }

  private async resolve(
    key: string,
    point: LocationPoint,
    options: { includeGeometry?: boolean },
  ): Promise<GeocodedPlace | null> {
    try {
      const cached = await this.pool.query<CachedRow>(
        `SELECT payload
           FROM geocoding_cache
          WHERE cache_key = $1
            AND expires_at > now()`,
        [key],
      );
      if (cached.rows[0]) return cached.rows[0].payload;
    } catch (error) {
      console.error('Persistent geocoding cache read failed; using upstream:', error);
    }

    const result = await this.fallback.reverse(point, options);
    try {
      await this.pool.query(
        `INSERT INTO geocoding_cache (cache_key, payload, expires_at)
         VALUES ($1, $2::jsonb, now() + ($3::double precision * interval '1 millisecond'))
         ON CONFLICT (cache_key) DO UPDATE SET
           payload = EXCLUDED.payload,
           expires_at = EXCLUDED.expires_at,
           updated_at = now()`,
        [key, JSON.stringify(result), this.ttlMs],
      );
      if (Date.now() >= this.nextCleanupAt) {
        this.nextCleanupAt = Date.now() + 60 * 60 * 1000;
        void this.pool.query('DELETE FROM geocoding_cache WHERE expires_at <= now()').catch(error => {
          console.error('Persistent geocoding cache cleanup failed:', error);
        });
      }
    } catch (error) {
      console.error('Persistent geocoding cache write failed:', error);
    }
    return result;
  }

  reverse(
    point: LocationPoint,
    options: { includeGeometry?: boolean } = {},
  ): Promise<GeocodedPlace | null> {
    const key = this.cacheKey(point, !!options.includeGeometry);
    const active = this.inFlight.get(key);
    if (active) return active;
    const request = this.resolve(key, point, options).finally(() => {
      if (this.inFlight.get(key) === request) this.inFlight.delete(key);
    });
    this.inFlight.set(key, request);
    return request;
  }

  search(query: string, near?: LocationPoint): Promise<GeocodedPlace[]> {
    return this.fallback.search(query, near);
  }
}
