import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware.js';
import {
  createOfferSchema,
  offerIdParamSchema,
  offerListSchema,
  rejectOfferSchema,
} from './offers.schema.js';
import * as offerController from './offers.controller.js';

const router: Router = Router();

router.use(requireAuth);

// COMPANY ROUTES (Company-initiated)

router.post('/', requireRole('COMPANY'), validate(createOfferSchema), offerController.createOffer);

router.get(
  '/my',
  requireRole('COMPANY'),
  validate(offerListSchema, 'query'),
  offerController.listMyOffers
);

router.get(
  '/my/:id',
  requireRole('COMPANY'),
  validate(offerIdParamSchema, 'params'),
  offerController.getMyOffer
);

router.delete(
  '/my/:id',
  requireRole('COMPANY'),
  validate(offerIdParamSchema, 'params'),
  offerController.cancelOffer
);

// EO ROUTES (incoming offers)

router.get(
  '/incoming',
  requireRole('EO'),
  validate(offerListSchema, 'query'),
  offerController.listIncomingOffers
);

router.get(
  '/incoming/:id',
  requireRole('EO'),
  validate(offerIdParamSchema, 'params'),
  offerController.getIncomingOffer
);

router.post(
  '/incoming/:id/accept',
  requireRole('EO'),
  validate(offerIdParamSchema, 'params'),
  offerController.acceptOffer
);

router.post(
  '/incoming/:id/reject',
  requireRole('EO'),
  validate(offerIdParamSchema, 'params'),
  validate(rejectOfferSchema),
  offerController.rejectOffer
);

export { router as offersRoutes };
