import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAreaElement, normalizeBuildingElement, normalizePoiElement } from './building-import-utils.js';

test('normalizes a closed OSM building way into a polygon', () => {
  const result = normalizeBuildingElement({
    type: 'way', id: 42, timestamp: '2026-01-01T00:00:00Z',
    tags: { building: 'house', name: 'Rumah Contoh' },
    geometry: [
      { lat: -8.49, lon: 140.4 }, { lat: -8.49, lon: 140.401 },
      { lat: -8.491, lon: 140.401 }, { lat: -8.49, lon: 140.4 },
    ],
  });
  assert.equal(result?.sourceId, 'way/42');
  assert.equal(result?.buildingType, 'house');
  assert.equal(result?.geometry.type, 'Polygon');
});

test('stitches relation member segments and preserves an inner courtyard', () => {
  const result = normalizeBuildingElement({
    type: 'relation', id: 91, tags: { building: 'commercial' },
    members: [
      { role: 'outer', geometry: [{ lat: 0, lon: 0 }, { lat: 0, lon: 2 }, { lat: 2, lon: 2 }] },
      { role: 'outer', geometry: [{ lat: 2, lon: 2 }, { lat: 2, lon: 0 }, { lat: 0, lon: 0 }] },
      { role: 'inner', geometry: [{ lat: .5, lon: .5 }, { lat: .5, lon: 1 }, { lat: 1, lon: 1 }, { lat: 1, lon: .5 }, { lat: .5, lon: .5 }] },
    ],
  });
  assert.equal(result?.geometry.type, 'Polygon');
  assert.equal(result?.geometry.coordinates.length, 2);
});

test('rejects open ways and objects without the building tag', () => {
  assert.equal(normalizeBuildingElement({ type: 'way', id: 1, tags: { building: 'yes' }, geometry: [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }] }), null);
  assert.equal(normalizeBuildingElement({ type: 'way', id: 2, tags: {}, geometry: [] }), null);
});

test('normalizes a named OSM POI and its structured address', () => {
  assert.deepEqual(normalizePoiElement({
    type: 'node', id: 77, lat: -8.49, lon: 140.4, timestamp: '2026-01-01T00:00:00Z',
    tags: { name: 'Notaris Contoh', office: 'notary', 'addr:street': 'Jalan Tidore', 'addr:housenumber': '12', 'addr:city': 'Merauke' },
  }), {
    sourceId: 'node/77', name: 'Notaris Contoh', category: 'office:notary',
    address: 'Jalan Tidore 12, Merauke', lat: -8.49, lng: 140.4,
    sourceUpdatedAt: '2026-01-01T00:00:00Z',
  });
});

test('rejects unnamed and unclassified OSM nodes as building POIs', () => {
  assert.equal(normalizePoiElement({ type: 'node', id: 8, lat: 0, lon: 0, tags: { office: 'notary' } }), null);
  assert.equal(normalizePoiElement({ type: 'node', id: 9, lat: 0, lon: 0, tags: { name: 'Rumah' } }), null);
});

test('normalizes an unnamed leisure pitch as a selectable area', () => {
  const result = normalizeAreaElement({
    type: 'way', id: 88, tags: { leisure: 'pitch' },
    geometry: [
      { lat: -8.49, lon: 140.4 }, { lat: -8.49, lon: 140.401 },
      { lat: -8.491, lon: 140.401 }, { lat: -8.49, lon: 140.4 },
    ],
  });
  assert.equal(result?.sourceId, 'way/88');
  assert.equal(result?.areaType, 'leisure:pitch');
  assert.equal(result?.geometry.type, 'Polygon');
});

test('rejects non-selectable landuse polygons', () => {
  assert.equal(normalizeAreaElement({ type: 'way', id: 89, tags: { landuse: 'residential' }, geometry: [] }), null);
});
