import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware.js';
import {
  catalogFilterSchema,
  createEventSchema,
  createTierSchema,
  eventIdParamSchema,
  eventSlugParamSchema,
  setProposalSchema,
  tierIdParamSchema,
  updateEventSchema,
  updateTierSchema,
  updateProposalContentSchema,
} from './events.schema.js';
import * as eventController from './events.controller.js';

// EO ROUTES (untuk owner)
const eoRouter: Router = Router();

eoRouter.use(requireAuth, requireRole('EO'));

eoRouter.post('/', validate(createEventSchema), eventController.create);
eoRouter.get('/my', eventController.listMine);
eoRouter.get('/:id', validate(eventIdParamSchema, 'params'), eventController.getMine);
eoRouter.patch(
  '/:id',
  validate(eventIdParamSchema, 'params'),
  validate(updateEventSchema),
  eventController.update
);
eoRouter.delete('/:id', validate(eventIdParamSchema, 'params'), eventController.remove);

eoRouter.post('/:id/publish', validate(eventIdParamSchema, 'params'), eventController.publish);
eoRouter.post('/:id/close', validate(eventIdParamSchema, 'params'), eventController.close);

eoRouter.post(
  '/:id/tiers',
  validate(eventIdParamSchema, 'params'),
  validate(createTierSchema),
  eventController.createTier
);
eoRouter.patch(
  '/:id/tiers/:tierId',
  validate(tierIdParamSchema, 'params'),
  validate(updateTierSchema),
  eventController.updateTier
);
eoRouter.delete(
  '/:id/tiers/:tierId',
  validate(tierIdParamSchema, 'params'),
  eventController.deleteTier
);

eoRouter.post(
  '/:id/proposal',
  validate(eventIdParamSchema, 'params'),
  validate(setProposalSchema),
  eventController.setProposal
);
eoRouter.patch(
  '/:id/proposal/content',
  validate(eventIdParamSchema, 'params'),
  validate(updateProposalContentSchema),
  eventController.updateProposalContent
);

eoRouter.delete('/:id/banner', eventController.deleteBanner);

// PUBLIC CATALOG ROUTES
const catalogRouter: Router = Router();

catalogRouter.get('/events', validate(catalogFilterSchema, 'query'), eventController.catalog);
catalogRouter.get(
  '/events/:slug',
  validate(eventSlugParamSchema, 'params'),
  eventController.publicDetail
);

export { eoRouter as eventsRoutes, catalogRouter as catalogRoutes };
