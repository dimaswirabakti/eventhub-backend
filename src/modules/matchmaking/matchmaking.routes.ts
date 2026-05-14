import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware.js';
import { eventIdParamSchema, recommendationQuerySchema } from './matchmaking.schema.js';
import * as matchmakingController from './matchmaking.controller.js';

const router: Router = Router();

router.use(requireAuth);

// Company FYP - "For You Page"
router.get(
  '/events',
  requireRole('COMPANY'),
  validate(recommendationQuerySchema, 'query'),
  matchmakingController.eventsForMe
);

// EO cari sponsor untuk event
router.get(
  '/sponsors/:eventId',
  requireRole('EO'),
  validate(eventIdParamSchema, 'params'),
  validate(recommendationQuerySchema, 'query'),
  matchmakingController.sponsorsForEvent
);

export { router as matchmakingRoutes };
