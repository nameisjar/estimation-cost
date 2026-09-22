import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import type { GeocodedPlace, GeocodingProvider } from '../../types/index.js';
import { PersistentReverseGeocodingProvider } from './persistent-reverse-geocoding.provider.js';

const point = { lat: -8.4932, lng: 140.4018 };
const place: GeocodedPlace = { ...point, name: 'Jalan Mandala', address: 'Mandala, Merauke' };

test('persistent reverse cache coalesces concurrent requests and survives provider memory cache', async () => {
  const stored = new Map<string, GeocodedPlace | null>();
  const pool = {
    async query(sql: string, parameters: unknown[] = []) {
      if (sql.includes('SELECT payload')) {
        const value = stored.get(String(parameters[0]));
        return { rows: value === undefined ? [] : [{ payload: value }] };
      }
      if (sql.includes('INSERT INTO geocoding_cache')) {
        stored.set(String(parameters[0]), JSON.parse(String(parameters[1])) as GeocodedPlace | null);
      }
      return { rows: [] };
    },
  } as unknown as Pool;
  let fallbackCalls = 0;
  const fallback: GeocodingProvider = {
    async reverse() {
      fallbackCalls++;
      await new Promise(resolve => setTimeout(resolve, 5));
      return place;
    },
    async search() { return []; },
  };

  const firstProvider = new PersistentReverseGeocodingProvider(pool, fallback);
  const [first, concurrent] = await Promise.all([
    firstProvider.reverse(point),
    firstProvider.reverse(point),
  ]);
  assert.deepEqual(first, place);
  assert.deepEqual(concurrent, place);
  assert.equal(fallbackCalls, 1);

  const restartedProvider = new PersistentReverseGeocodingProvider(pool, fallback);
  assert.deepEqual(await restartedProvider.reverse(point), place);
  assert.equal(fallbackCalls, 1);
});
