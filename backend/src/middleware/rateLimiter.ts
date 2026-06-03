import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

/**
 * Rate limiter middleware for API endpoints
 * Limits requests per IP address
 */
export function rateLimiter(
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  maxRequests: number = 100 // 100 requests per window
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Initialize or get existing record
    if (!store[ip]) {
      store[ip] = { count: 1, resetTime: now + windowMs };
      next();
      return;
    }

    // Check if window has expired
    if (now > store[ip].resetTime) {
      store[ip] = { count: 1, resetTime: now + windowMs };
      next();
      return;
    }

    // Increment counter
    store[ip].count++;

    // Check if limit exceeded
    if (store[ip].count > maxRequests) {
      const resetTime = new Date(store[ip].resetTime);
      logger.warn(`Rate limit exceeded for IP: ${ip}`);
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Max ${maxRequests} requests per ${Math.round(windowMs / 60000)} minutes.`,
        retryAfter: Math.ceil((store[ip].resetTime - now) / 1000),
        resetTime: resetTime.toISOString(),
      });
      return;
    }

    // Set rate limit headers
    const remainingRequests = maxRequests - store[ip].count;
    const resetTime = store[ip].resetTime;

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remainingRequests);
    res.setHeader('X-RateLimit-Reset', resetTime);

    next();
  };
}

/* ---------------------------------------------------------------------------
 * Per-route classify limiter (tighter per-IP cap + a global all-IPs RPM ceiling)
 *
 * Two independent gates, both in-memory (single-replica invariant, same as the
 * cost monitor):
 *   1. per-IP: CLASSIFY_RATE_MAX (default 5) per CLASSIFY_RATE_WINDOW_MS
 *      (default 60s) → 429 on exceed (same body shape as `rateLimiter`).
 *   2. global: CLASSIFY_GLOBAL_RPM (default 20) across ALL IPs per 60s → 503 on
 *      exceed (the classifier is a shared scarce resource on the free tier).
 * Both reuse the in-memory store + the existing cleanup sweep.
 * --------------------------------------------------------------------------- */

/** Reserved store key for the global all-IPs classify counter. */
const CLASSIFY_GLOBAL_KEY = '__classify_global__';

/** Fixed 60s window for the global RPM gate (independent of the per-IP window). */
const CLASSIFY_GLOBAL_WINDOW_MS = 60 * 1000;

/**
 * Per-route rate limiter for the classify endpoints. Enforces BOTH a tighter
 * per-IP cap AND a global all-IPs RPM ceiling. Defaults read lazily from env so
 * tests/dev can override per case.
 */
export function classifyRateLimiter() {
  return (req: Request, res: Response, next: NextFunction) => {
    const perIpMax = parseInt(process.env.CLASSIFY_RATE_MAX || '5');
    const perIpWindowMs = parseInt(process.env.CLASSIFY_RATE_WINDOW_MS || '60000');
    const globalRpm = parseInt(process.env.CLASSIFY_GLOBAL_RPM || '20');
    const now = Date.now();

    // --- Global all-IPs RPM gate (checked first; a shared 503 protects the box). ---
    const globalEntry = store[CLASSIFY_GLOBAL_KEY];
    if (!globalEntry || now > globalEntry.resetTime) {
      store[CLASSIFY_GLOBAL_KEY] = { count: 1, resetTime: now + CLASSIFY_GLOBAL_WINDOW_MS };
    } else {
      globalEntry.count++;
      if (globalEntry.count > globalRpm) {
        logger.warn('Classify global RPM ceiling exceeded');
        res.status(503).json({
          error: 'The classifier is busy right now. Please try again shortly.',
          retryable: true,
        });
        return;
      }
    }

    // --- Per-IP gate (namespaced key so it never collides with the global limiter). ---
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `classify:${ip}`;
    const entry = store[key];
    if (!entry || now > entry.resetTime) {
      store[key] = { count: 1, resetTime: now + perIpWindowMs };
      next();
      return;
    }

    entry.count++;
    if (entry.count > perIpMax) {
      logger.warn(`Classify rate limit exceeded for IP: ${ip}`);
      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Max ${perIpMax} requests per ${Math.round(perIpWindowMs / 60000)} minutes.`,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        resetTime: new Date(entry.resetTime).toISOString(),
      });
      return;
    }

    next();
  };
}

/** Test-only: clear ALL rate-limit store entries (per-IP + global counters). */
export function _resetRateLimitStoreForTesting(): void {
  for (const key in store) {
    delete store[key];
  }
}

/**
 * Clean up old entries from the store (runs every 5 minutes)
 */
export function startRateLimitCleanup() {
  setInterval(() => {
    const now = Date.now();
    for (const ip in store) {
      if (store[ip] && store[ip].resetTime < now) {
        delete store[ip];
      }
    }
  }, 5 * 60 * 1000);
}
