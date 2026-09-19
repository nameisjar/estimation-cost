import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdminAuthService, hashAdminPassword } from './admin-auth.service.js';

const password = 'Password-Aman-123';
const service = new AdminAuthService({
  enabled: true,
  username: 'admin',
  passwordHash: hashAdminPassword(password, '0123456789abcdef0123456789abcdef'),
  sessionSecret: 'secret-session-admin-yang-panjang-1234567890',
  sessionHours: 8,
});

test('admin credentials use scrypt and reject incorrect values', () => {
  assert.equal(service.verifyCredentials('admin', password), true);
  assert.equal(service.verifyCredentials('admin', 'password-salah'), false);
  assert.equal(service.verifyCredentials('user', password), false);
});

test('admin session validates signature and expiration', () => {
  const now = Date.UTC(2026, 8, 19);
  const token = service.createToken(now);
  const cookie = service.sessionCookie(token, false);
  const tamperedToken = `${token.slice(0, -1)}${token.endsWith('x') ? 'y' : 'x'}`;
  assert.equal(service.readSession(cookie, now)?.sub, 'admin');
  assert.equal(service.readSession(service.sessionCookie(tamperedToken, false), now), null);
  assert.equal(service.readSession(cookie, now + 9 * 3600 * 1000), null);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
});
