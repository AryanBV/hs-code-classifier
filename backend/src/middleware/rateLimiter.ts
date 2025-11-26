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
