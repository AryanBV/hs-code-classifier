import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { timingSafeEqual } from 'crypto';
import { logger } from './utils/logger';
import { rateLimiter, startRateLimitCleanup } from './middleware/rateLimiter';
import { connectDatabase, disconnectDatabase } from './utils/prisma';
import classifyRouter from './api/classify';
import { startWorker, stopWorker } from './api/classifier-worker';
import { sweepExpired } from './api/job-store';
import { costMonitor } from './api/cost-monitor';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3001;

// ========================================
// Middleware
// ========================================

// B1a: trust EXACTLY ONE proxy hop (Railway's edge). Bounded — NOT `true`, which
// would trust the entire X-Forwarded-For chain and let a client SPOOF its IP.
// MUST run before rateLimiter so req.ip resolves to the real client IP instead of
// the proxy IP (otherwise the per-IP limiter collapses ALL users into one bucket).
app.set('trust proxy', 1);

// Start rate limit cleanup
startRateLimitCleanup();

// Rate limiter middleware
const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000');
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');
app.use(rateLimiter(windowMs, maxRequests));

// CORS configuration - Support multiple origins.
// B1a: FAIL LOUD in production if FRONTEND_URL is unset — credentials:true needs
// an EXACT origin, and silently defaulting to localhost in prod would block every
// real browser request with an opaque CORS error. In dev we keep the localhost
// default for convenience.
if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL?.trim()) {
  logger.error(
    'FATAL: FRONTEND_URL is unset in production. Set it to the exact frontend origin(s). Refusing to start.',
  );
  process.exit(1);
}
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((url: string) => url.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ========================================
// Routes
// ========================================

/**
 * Constant-time check that a presented x-internal-token matches INTERNAL_API_TOKEN.
 * Returns false (no detail leaked) when the env is unset or the header mismatches.
 */
function hasValidInternalToken(req: Request): boolean {
  const expected = process.env.INTERNAL_API_TOKEN;
  if (expected === undefined || expected === '') return false;
  const provided = req.header('x-internal-token');
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Health check endpoint. PUBLIC response is intentionally minimal (status +
// timestamp) so an unauthenticated probe leaks NO operational detail. The
// internal observability block (env shape + daily cost counter) is included ONLY
// when a valid x-internal-token is presented (and only when the env is set).
app.get('/health', (req: Request, res: Response) => {
  const body: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  if (hasValidInternalToken(req)) {
    body.service = 'Prevyl HS Code Classifier';
    body.environment = {
      nodeEnv: process.env.NODE_ENV,
      hasDatabase: !!process.env.DATABASE_URL,
      port: process.env.PORT || 3001,
    };
    // B1b: today's in-process usage (single-replica counter) so cost/RPD is
    // observable without log-diving — the guard against repeating the May
    // blind-flying overspend.
    body.cost = costMonitor.getDailyStats();
  }

  res.status(200).json(body);
});

// Classification routes
app.use('/api/classify', classifyRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString()
  });
});

// ========================================
// Error Handler
// ========================================

app.use((err: Error, req: Request, res: Response, next: any) => {
  logger.error(`Error: ${err.message}`);
  logger.error(err.stack || '');

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// ========================================
// Start Server
// ========================================

// Initialize database and start server
async function startServer() {
  try {
    // Verify database connection before starting server
    await connectDatabase();

    app.listen(PORT, () => {
      // B1a: single boot line carrying the resolved PORT + a process/instance
      // marker. The single-replica invariant (one rate bucket + one per-IP
      // limiter + one cost counter) is config-enforced; this log makes an
      // ACCIDENTAL 2nd replica visible (two distinct instance markers in logs).
      const instanceId =
        process.env.RAILWAY_REPLICA_ID ||
        process.env.RAILWAY_INSTANCE_ID ||
        process.env.HOSTNAME ||
        `pid-${process.pid}`;
      logger.info(
        `[BOOT] HS-code classifier listening on port ${PORT} | env=${process.env.NODE_ENV || 'development'} | instance=${instanceId} | pid=${process.pid}`,
      );
      logger.info(`Server running on http://localhost:${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Phase B job-queue spine — only when async mode is enabled so dev/tests are
    // unaffected. The single rate-limited worker drains the classification_jobs
    // queue; a periodic sweep clears expired (24h TTL) rows.
    if (process.env.CLASSIFY_ASYNC === 'true') {
      const pollMs = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '1000');
      startWorker(pollMs);
      logger.info('Classification worker started (CLASSIFY_ASYNC=true)');

      startJobSweep();
    }
  } catch (error) {
    logger.error('Failed to start server');
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Register the periodic expired-job sweep (mirrors startRateLimitCleanup's
 * setInterval pattern). The timer is unref'd so it never holds the process open.
 */
function startJobSweep(): void {
  const sweepMs = parseInt(process.env.JOB_SWEEP_INTERVAL_MS || '3600000'); // 1h default
  const timer = setInterval(() => {
    sweepExpired()
      .then((removed) => {
        if (removed > 0) logger.info(`Swept ${removed} expired classification jobs`);
      })
      .catch((err: unknown) => {
        logger.error(`Job sweep failed: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, sweepMs);
  timer.unref?.();
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  stopWorker();
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  stopWorker();
  await disconnectDatabase();
  process.exit(0);
});
