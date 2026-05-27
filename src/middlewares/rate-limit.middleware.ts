import type { Request, Response, NextFunction } from 'express';
import { Ratelimit } from '@upstash/ratelimit';
import { StatusCodes } from 'http-status-codes';
import { redis } from '@/config/redis.js';
import { logger } from '@/config/logger.js';

type KeyStrategy = 'ip' | 'user';

interface RateLimitOptions {
  // Jumlah request yang diizinkan dalam window
  requests: number;
  // Durasi window, format Upstash Duration
  window: `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`;
  // Identifier: by IP (public) atau by userId (authenticated)
  by: KeyStrategy;
  // Prefix untuk namespace di Redis (misal: 'auth', 'ai', 'global')
  prefix: string;
}

const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() ?? 'unknown';
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
};

export const createRateLimiter = (options: RateLimitOptions) => {
  if (!redis) {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    };
  }

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(options.requests, options.window),
    prefix: `ratelimit:${options.prefix}`,
    analytics: false,
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    let identifier: string;
    if (options.by === 'user') {
      // Authenticated route, pakai userId. Fallback ke IP kalau belum ada user
      identifier = req.user?.id ?? getClientIp(req);
    } else {
      identifier = getClientIp(req);
    }

    void limiter
      .limit(identifier)
      .then(({ success, limit, remaining, reset }) => {
        res.setHeader('X-RateLimit-Limit', limit.toString());
        res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
        res.setHeader('X-RateLimit-Reset', reset.toString());

        if (!success) {
          const retryAfterSec = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
          res.setHeader('Retry-After', retryAfterSec.toString());
          res.status(StatusCodes.TOO_MANY_REQUESTS).json({
            success: false,
            message: `Too many requests. Please try again in ${retryAfterSec} seconds.`,
          });
          return;
        }

        next();
      })
      .catch((err: unknown) => {
        logger.error({ err, prefix: options.prefix }, 'Rate limiter error — failing open');
        next();
      });
  };
};

// PRE-CONFIGURED LIMITERS (3 tier)

// Tier ketat: auth endpoints (register/login), 5 req/menit per IP.
export const authRateLimiter = createRateLimiter({
  requests: 5,
  window: '1 m',
  by: 'ip',
  prefix: 'auth',
});

// Tier sedang: AI endpoints, 10 req/menit per user.
export const aiRateLimiter = createRateLimiter({
  requests: 10,
  window: '1 m',
  by: 'user',
  prefix: 'ai',
});

// Tier longgar: global, 100 req/menit per IP.
export const globalRateLimiter = createRateLimiter({
  requests: 100,
  window: '1 m',
  by: 'ip',
  prefix: 'global',
});
