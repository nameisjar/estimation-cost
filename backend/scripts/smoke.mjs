import assert from 'node:assert/strict';
const backend = process.env.SMOKE_API_URL || 'http://localhost:3000';
const pickup = { lat: -8.4932, lng: 140.4018 };
const destination = { lat: -8.4965, lng: 140.4072 };
async function post(geometry) {
  const response = await fetch(`${backend}/api/estimate${geometry ? '?geometry=true' : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pickup, destination }), signal: AbortSignal.timeout(20000) });
  const body = await response.json();
  console.log(JSON.stringify({ geometry, status: response.status, success: body.success, ...(body.data ? { distanceKm: body.data.distanceKm, durationMinutes: body.data.durationMinutes, total: body.data.pricing.total, geometryPoints: body.data.geometry?.coordinates.length || 0 } : { error: body.error }) }, null, 2));
  assert.equal(response.status, 200); assert.equal(body.success, true);
  assert.ok(body.data.distanceKm >= 0 && body.data.durationMinutes >= 0);
  const pricing = body.data.pricing;
  assert.equal(pricing.total, Math.max(pricing.minimumFare, pricing.baseFare + Math.ceil(Math.max(0, body.data.distanceKm - pricing.includedKm)) * pricing.pricePerKm));
  if (geometry) { assert.equal(body.data.geometry.type, 'LineString'); assert.ok(body.data.geometry.coordinates.length > 2); }
  else assert.equal(body.data.geometry, undefined);
  return body.data;
}
const health = await fetch(`${backend}/health`); assert.equal(health.status, 200); console.log('HEALTH:', await health.text());
const config = await fetch(`${backend}/api/config`); assert.equal(config.status, 200); console.log('CONFIG:', await config.text());
const plain = await post(false); const route = await post(true);
assert.equal(plain.distanceKm, route.distanceKm); assert.equal(plain.durationMinutes, route.durationMinutes);
const invalid = await fetch(`${backend}/api/estimate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pickup: { lat: 91, lng: 140 }, destination }) });
assert.equal(invalid.status, 400); console.log('INVALID COORDINATES:', invalid.status, await invalid.text());
console.log('LIVE API SMOKE: PASS');
