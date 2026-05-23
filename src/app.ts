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
import { matchmakingRoutes } from '@/modules/matchmaking/matchmaking.routes.js';
import { profileRoutes } from '@/modules/profile/profile.routes.js';
import { savedEventsRoutes } from '@/modules/saved-events/saved-events.routes.js';
import { offersRoutes } from '@/modules/offers/offers.routes.js';
import { pitchesRoutes } from '@/modules/offers/pitches.routes.js';
import { billingRoutes } from '@/modules/billing/billing.routes.js';

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
  app.use(`/api/${env.API_VERSION}/profile`, profileRoutes);
  app.use(`/api/${env.API_VERSION}/events`, eventsRoutes);
  app.use(`/api/${env.API_VERSION}/saved-events`, savedEventsRoutes);
  app.use(`/api/${env.API_VERSION}/catalog`, catalogRoutes);
  app.use(`/api/${env.API_VERSION}/offers`, offersRoutes);
  app.use(`/api/${env.API_VERSION}/pitches`, pitchesRoutes);
  app.use(`/api/${env.API_VERSION}/ai`, aiRoutes);
  app.use(`/api/${env.API_VERSION}/recommendations`, matchmakingRoutes);
  app.use(`/api/${env.API_VERSION}/billing`, billingRoutes);

  // 404 & error handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
