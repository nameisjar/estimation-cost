import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createRateLimiter } from './rate-limit.js';

test('rate limiter blocks requests over the per-client limit and returns retry metadata', () => {
  const middleware = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
  const headers = new Map<string, string>();
  let status = 200;
  let body: unknown;
  let continued = 0;
  const request = { ip: '127.0.0.1', socket: {} } as Request;
  const response = {
    setHeader(name: string, value: string) { headers.set(name, value); },
    status(value: number) { status = value; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as Response;
  const next = () => { continued += 1; };

  middleware(request, response, next);
  middleware(request, response, next);
  middleware(request, response, next);

  assert.equal(continued, 2);
  assert.equal(status, 429);
  assert.equal(headers.get('RateLimit-Limit'), '2');
  assert.equal(headers.get('RateLimit-Remaining'), '0');
  assert.ok(Number(headers.get('Retry-After')) >= 1);
  assert.deepEqual(body, {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.' },
  });
});
