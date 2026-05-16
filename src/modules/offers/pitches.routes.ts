import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware.js';
import {
  createPitchSchema,
  offerIdParamSchema,
  offerListSchema,
  rejectOfferSchema,
} from './offers.schema.js';
import * as pitchController from './pitches.controller.js';

const router: Router = Router();

router.use(requireAuth);

// EO ROUTES (EO-initiated pitches)

router.post('/', requireRole('EO'), validate(createPitchSchema), pitchController.createPitch);

router.get(
  '/my',
  requireRole('EO'),
  validate(offerListSchema, 'query'),
  pitchController.listMyPitches
);

router.get(
  '/my/:id',
  requireRole('EO'),
  validate(offerIdParamSchema, 'params'),
  pitchController.getMyPitch
);

router.delete(
  '/my/:id',
  requireRole('EO'),
  validate(offerIdParamSchema, 'params'),
  pitchController.cancelPitch
);

// COMPANY ROUTES (incoming pitches)

router.get(
  '/incoming',
  requireRole('COMPANY'),
  validate(offerListSchema, 'query'),
  pitchController.listIncomingPitches
);

router.get(
  '/incoming/:id',
  requireRole('COMPANY'),
  validate(offerIdParamSchema, 'params'),
  pitchController.getIncomingPitch
);

router.post(
  '/incoming/:id/accept',
  requireRole('COMPANY'),
  validate(offerIdParamSchema, 'params'),
  pitchController.acceptPitch
);

router.post(
  '/incoming/:id/reject',
  requireRole('COMPANY'),
  validate(offerIdParamSchema, 'params'),
  validate(rejectOfferSchema),
  pitchController.rejectPitch
);

export { router as pitchesRoutes };
