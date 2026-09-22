import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { PostgisBuildingRepository } from './postgis-building.repository.js';

test('location lookup requires strict polygon coverage and returns a contained-place name', async () => {
  const pool = {
    async query(sql: string, values: unknown[]) {
      assert.match(sql, /ST_Covers\(building_footprints\.geometry, target\.geometry\)/);
      assert.match(sql, /building_footprints\.geometry && target\.geometry/);
      assert.match(sql, /FROM osm_areas/);
      assert.match(sql, /selected AS MATERIALIZED/);
      assert.match(sql, /places\.location::geometry && selected\.geometry/);
      assert.match(sql, /ST_Covers\(selected\.geometry, places\.location::geometry\)/);
      assert.match(sql, /candidates\.kind_priority ASC/);
      assert.doesNotMatch(sql, /geometry::geography/);
      assert.doesNotMatch(sql, /ST_DWithin/);
      assert.deepEqual(values, [-8.4934, 140.401]);
      return {
        rows: [{
          source_id: 'way/10', kind: 'building', name: 'Toko di Bangunan', address: 'Jalan Contoh 10', building_type: 'retail',
          geometry: JSON.stringify({ type: 'Polygon', coordinates: [[[140.4, -8.49], [140.401, -8.49], [140.4, -8.49]]] }),
          distance_meters: 0,
        }],
      };
    },
  } as unknown as Pool;
  const result = await new PostgisBuildingRepository(pool).findAt({ lat: -8.4934, lng: 140.401 });
  assert.equal(result?.name, 'Toko di Bangunan');
  assert.equal(result?.kind, 'building');
  assert.equal(result?.address, 'Jalan Contoh 10');
  assert.equal(result?.distanceMeters, 0);
});
