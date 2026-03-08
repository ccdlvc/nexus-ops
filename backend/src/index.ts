/**
 * @module index
 * @description Nexus Ops backend entrypoint.
 *
 * Bootstraps the Express + WebSocket server:
 *   1. Runs Drizzle database migrations and seeds default alert rules.
 *   2. Mounts all API route groups under /api.
 *   3. Starts the AlertMonitor background job (polls every 2 min).
 *   4. Exposes /health (liveness) and /metrics (Prometheus scrape) endpoints.
 *   5. Upgrades the HTTP server with a WebSocket server to push live alerts.
 *
 * Environment variables consumed here:
 *   PORT             – TCP port to listen on (default 4000)
 *   ALLOWED_ORIGINS  – Comma-separated CORS allow-list (default *)
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import { logger } from './utils/logger';
import { initDb } from './storage/db';
import { AlertMonitor } from './alerts/monitor';
import { metricsRegistry, refreshMetrics } from './metrics/registry';

import incidentRoutes from './routes/incidents';
import queryRoutes from './routes/query';
import alertRoutes from './routes/alerts';
import integrationRoutes from './routes/integrations';
import connectorRoutes from './routes/connectors';

dotenv.config();

async function main() {
  // ─── DB init (migrations + seed) ──────────────────────────────────────────
  await initDb();

  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  // ─── Middleware ─────────────────────────────────────────────────────────────
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(morgan('combined', { stream: { write: (msg) => logger.http(msg.trim()) } }));

  const limiter = rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true });
  app.use('/api', limiter);

  // ─── Monitor ────────────────────────────────────────────────────────────────
  const alertMonitor = new AlertMonitor(wss);

  // ─── Routes ─────────────────────────────────────────────────────────────────
  app.use('/api/incidents', incidentRoutes);
  app.use('/api/query', queryRoutes);
  app.use('/api/alerts', alertRoutes);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/connectors', connectorRoutes);

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  // ─── Prometheus scrape endpoint ─────────────────────────────────────────────
  app.get('/metrics', async (_req, res) => {
    await refreshMetrics();
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  });

  // ─── WebSocket: push live alerts ────────────────────────────────────────────
  wss.on('connection', (ws) => {
    logger.info('WebSocket client connected');
    ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
    ws.on('close', () => logger.info('WebSocket client disconnected'));
  });

  // ─── Global error handler ───────────────────────────────────────────────────
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
    res.status(500).json({ success: false, error: 'Internal server error', timestamp: new Date().toISOString() });
  });

  // ─── Start ──────────────────────────────────────────────────────────────────
  const PORT = parseInt(process.env.PORT ?? '4000', 10);
  httpServer.listen(PORT, () => {
    logger.info(`Nexus Ops backend running on port ${PORT}`);
    alertMonitor.start();
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
