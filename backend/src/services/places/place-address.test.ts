import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressSourceForInput, displayPlaceAddress, formatSearchArea, isMissingAddress } from './place-address.js';

test('place address falls back to a readable survey area', () => {
  assert.equal(displayPlaceAddress('Alamat belum tersedia', 'merauke, papua selatan'), 'Merauke, Papua Selatan');
  assert.equal(displayPlaceAddress('', ''), 'Sekitar Merauke, Papua Selatan');
  assert.equal(displayPlaceAddress('Jl. Raya Mandala', 'merauke'), 'Jl. Raya Mandala');
});

test('place address status recognizes missing and manually supplied values', () => {
  assert.equal(isMissingAddress(' Alamat belum tersedia '), true);
  assert.equal(isMissingAddress('Jalan Ahmad Yani'), false);
  assert.equal(addressSourceForInput(''), 'missing');
  assert.equal(addressSourceForInput('Jalan Ahmad Yani'), 'manual');
  assert.equal(formatSearchArea('MERAUKE, papua SELATAN'), 'Merauke, Papua Selatan');
});
