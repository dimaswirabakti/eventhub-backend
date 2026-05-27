import { Redis } from '@upstash/redis';
import { env } from './env.js';
import { logger } from './logger.js';

export const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

if (!redis) {
  logger.warn(
    'Upstash Redis not configured — rate limiting is DISABLED (fail-open). Set UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN to enable.'
  );
}
