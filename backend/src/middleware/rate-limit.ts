import type { RequestHandler } from 'express';
import type { RateLimitConfig } from '../types/index.js';

type ClientWindow = { count: number; resetAt: number };

export function createRateLimiter(config: RateLimitConfig): RequestHandler {
  const clients = new Map<string, ClientWindow>();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let current = clients.get(key);

    if (!current || now >= current.resetAt) {
      current = { count: 0, resetAt: now + config.windowMs };
      clients.set(key, current);
    }

    const remaining = Math.max(0, config.maxRequests - current.count - 1);
    res.setHeader('RateLimit-Limit', String(config.maxRequests));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(current.resetAt / 1000)));

    if (current.count >= config.maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
        },
      });
      return;
    }

    current.count += 1;
    if (clients.size > 1000) {
      for (const [clientKey, window] of clients) {
        if (now >= window.resetAt) clients.delete(clientKey);
      }
    }
    next();
  };
}
