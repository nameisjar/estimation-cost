import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SurveyFirstGeocodingProvider } from './survey-first.provider.js';
import type { GeocodingProvider, PlaceRepository } from '../../types/index.js';

const point = { lat: -8.4932, lng: 140.4018 };
const localPlace = { id: 'local-1', ...point, name: 'Warung Survei', address: 'Merauke', source: 'antarfix' as const };

function repository(results: { search?: typeof localPlace[]; nearest?: typeof localPlace | null }): PlaceRepository {
  return {
    async search() { return results.search ?? []; },
    async nearest() { return results.nearest ?? null; },
    async inBounds() { return []; },
  };
}

test('survey places are preferred for search and reverse geocoding', async () => {
  let fallbackCalls = 0;
  const fallback: GeocodingProvider = {
    async search() { fallbackCalls++; return []; },
    async reverse() { fallbackCalls++; return null; },
  };
  const provider = new SurveyFirstGeocodingProvider(repository({ search: [localPlace], nearest: localPlace }), fallback);
  assert.deepEqual(await provider.search('warung', point), [localPlace]);
  assert.deepEqual(await provider.reverse(point), localPlace);
  assert.equal(fallbackCalls, 0);
});

test('Nominatim fallback is used when survey data has no match', async () => {
  const fallbackPlace = { ...point, name: 'Hasil OSM', address: 'Merauke', source: 'openstreetmap' as const };
  const fallback: GeocodingProvider = {
    async search() { return [fallbackPlace]; },
    async reverse() { return fallbackPlace; },
  };
  const provider = new SurveyFirstGeocodingProvider(repository({ search: [], nearest: null }), fallback);
  assert.deepEqual(await provider.search('hasil', point), [fallbackPlace]);
  assert.deepEqual(await provider.reverse(point), fallbackPlace);
});
