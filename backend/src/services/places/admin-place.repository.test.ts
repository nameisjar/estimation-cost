import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { ApiError } from '../../errors.js';
import { AdminPlaceRepository } from './admin-place.repository.js';

const placeId = '4da6939d-c54f-40bb-a321-c678ca22bd44';

function repositoryWithOutcome(outcome: {
  place_exists: boolean;
  place_active: boolean | null;
  place_deleted: boolean;
}) {
  const pool = {
    async query(sql: string, values: unknown[]) {
      assert.match(sql, /DELETE FROM places/);
      assert.match(sql, /active=FALSE/);
      assert.deepEqual(values, [placeId]);
      return { rows: [outcome] };
    },
  } as unknown as Pool;
  return new AdminPlaceRepository(pool);
}

test('permanent deletion only removes an inactive place', async () => {
  const repository = repositoryWithOutcome({ place_exists: true, place_active: false, place_deleted: true });
  await repository.deleteInactive(placeId);
});

test('permanent deletion rejects active and missing places', async () => {
  const active = repositoryWithOutcome({ place_exists: true, place_active: true, place_deleted: false });
  await assert.rejects(
    active.deleteInactive(placeId),
    error => error instanceof ApiError && error.status === 409 && error.code === 'PLACE_MUST_BE_INACTIVE',
  );

  const missing = repositoryWithOutcome({ place_exists: false, place_active: null, place_deleted: false });
  await assert.rejects(
    missing.deleteInactive(placeId),
    error => error instanceof ApiError && error.status === 404 && error.code === 'PLACE_NOT_FOUND',
  );
});
