import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { pinoHttp } from 'pino-http';
import { env } from '@/config/env.js';
import { logger } from '@/config/logger.js';
import { errorHandler, notFoundHandler } from '@/middlewares/error.middleware.js';
import { authRoutes } from '@/modules/auth/auth.routes.js';
import { eventsRoutes, catalogRoutes } from '@/modules/events/events.routes.js';
import { aiRoutes } from '@/modules/ai/ai.routes.js';

export const createApp = (): Express => {
  const app = express();

  // Security & performance
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(','),
      credentials: true,
    })
  );
  app.use(compression());

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Logging
  app.use(pinoHttp({ logger }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use(`/api/${env.API_VERSION}/auth`, authRoutes);
  app.use(`/api/${env.API_VERSION}/events`, eventsRoutes);
  app.use(`/api/${env.API_VERSION}/catalog`, catalogRoutes);
  app.use(`/api/${env.API_VERSION}/ai`, aiRoutes);

  // 404 & error handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
