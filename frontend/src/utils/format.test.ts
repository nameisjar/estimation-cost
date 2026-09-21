import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, formatDuration, whatsappLinks, whatsappUrl } from './format';
test('Rupiah formatting', () => { assert.equal(formatCurrency(8000), 'Rp8.000'); assert.equal(formatCurrency(18000), 'Rp18.000'); assert.equal(formatCurrency(25500), 'Rp25.500'); });
test('duration formatting', () => { assert.equal(formatDuration(5), '±5 menit'); assert.equal(formatDuration(65), '±1 jam 5 menit'); assert.equal(formatDuration(60), '±1 jam'); assert.equal(formatDuration(0.4), '±1 menit'); });
test('WhatsApp requires configured number and encodes coordinates and price', () => {
  const a = { lat: -8.4932, lng: 140.4018 }; const b = { lat: -8.4965, lng: 140.4072 };
  const details = {
    pickup: a,
    destination: b,
    pickupPlace: { ...a, name: 'Warung Mie Ayam', address: 'Jalan Mandala, Merauke' },
    destinationPlace: { ...b, name: 'Lapangan Jawa', address: 'Karang Indah, Merauke' },
    distanceKm: 5.2,
    durationMinutes: 12,
    total: 18000,
  };
  assert.equal(whatsappUrl('', details), null);
  const url = new URL(whatsappUrl('6281234567890', details)!);
  assert.equal(url.hostname, 'wa.me'); assert.equal(url.pathname, '/6281234567890');
  const message = url.searchParams.get('text')!;
  assert.ok(message.includes('*LOKASI JEMPUT*\nWarung Mie Ayam\nJalan Mandala, Merauke'));
  assert.ok(message.includes('Peta: https://www.google.com/maps?q=-8.4932,140.4018'));
  assert.ok(message.includes('*TUJUAN*\nLapangan Jawa'));
  assert.ok(message.includes('Waktu tempuh: sekitar 12 menit'));
  assert.ok(message.includes('Biaya: *Rp18.000*'));
  assert.ok(!message.includes('�'));

  const links = whatsappLinks('6281234567890', details)!;
  const appUrl = new URL(links.app);
  assert.equal(appUrl.protocol, 'whatsapp:');
  assert.equal(appUrl.hostname, 'send');
  assert.equal(appUrl.searchParams.get('phone'), '6281234567890');
  assert.equal(appUrl.searchParams.get('text'), message);
  assert.equal(links.web, whatsappUrl('6281234567890', details));
});
