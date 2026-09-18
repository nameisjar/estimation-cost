import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, formatDuration, whatsappUrl } from './format';
test('Rupiah formatting', () => { assert.equal(formatCurrency(8000), 'Rp8.000'); assert.equal(formatCurrency(18000), 'Rp18.000'); assert.equal(formatCurrency(25500), 'Rp25.500'); });
test('duration formatting', () => { assert.equal(formatDuration(5), '±5 menit'); assert.equal(formatDuration(65), '±1 jam 5 menit'); assert.equal(formatDuration(60), '±1 jam'); assert.equal(formatDuration(0.4), '±1 menit'); });
test('WhatsApp requires configured number and encodes coordinates and price', () => {
  const a = { lat: -8.4932, lng: 140.4018 }; const b = { lat: -8.4965, lng: 140.4072 };
  assert.equal(whatsappUrl('', a, b, 5.2, 18000), null);
  const url = new URL(whatsappUrl('6281234567890', a, b, 5.2, 18000)!);
  assert.equal(url.hostname, 'wa.me'); assert.equal(url.pathname, '/6281234567890');
  const message = url.searchParams.get('text')!; assert.ok(message.includes('-8.49320, 140.40180')); assert.ok(message.includes('Rp18.000')); assert.ok(message.includes('\n\n'));
});
