import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { apiRouter } from './routes.js';
import { authenticate } from './auth.js';
import { config } from './config.js';
import { pool } from './db.js';
import { ApiError } from './errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.TRUST_PROXY_HOPS > 0) app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(cors({ origin: config.FRONTEND_ORIGIN.split(',').map((item) => item.trim()), credentials: false }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  });

  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use('/api', authenticate);
  app.use('/api', apiRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Проверьте заполненные поля', fields: error.flatten() } });
      return;
    }
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
      return;
    }
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: 'Действие уже было выполнено' } });
      return;
    }
    console.error('Unhandled API error', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервиса' } });
  });
  return app;
}
