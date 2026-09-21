import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryDefaultIcon,
  placeIconLabel,
  placeIconOptions,
  placeIconSvg,
  resolvePlaceIcon,
} from './place-icons.js';

test('every selectable place icon has SVG markup', () => {
  for (const option of placeIconOptions) {
    assert.ok(placeIconSvg[option.value], `SVG ikon ${option.value} belum tersedia`);
  }
});

test('every category default resolves to a selectable icon', () => {
  const selectable = new Set<string>(placeIconOptions.map(option => option.value));
  for (const icon of Object.values(categoryDefaultIcon)) assert.ok(selectable.has(icon));
});

test('unknown icon falls back to the category icon and label', () => {
  assert.equal(resolvePlaceIcon('unknown', 'medical'), 'medical');
  assert.equal(placeIconLabel('unknown', 'medical'), 'Kesehatan umum');
  assert.equal(resolvePlaceIcon(undefined, undefined), 'other');
});

test('specialized map icons resolve for sports, tourism and business places', () => {
  assert.equal(resolvePlaceIcon('basketball', 'sports'), 'basketball');
  assert.equal(placeIconLabel('football', 'sports'), 'Sepak bola / Futsal');
  assert.equal(resolvePlaceIcon(undefined, 'tourism'), 'tourism');
  assert.equal(resolvePlaceIcon(undefined, 'business'), 'business');
});
