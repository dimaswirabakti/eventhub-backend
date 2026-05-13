import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware.js';
import { generateProposalSchema, reviewProposalSchema } from './ai.schema.js';
import * as aiController from './ai.controller.js';

const router: Router = Router();

router.use(requireAuth, requireRole('EO'));

router.post('/proposal-builder', validate(generateProposalSchema), aiController.generateProposal);

router.post('/smart-review', validate(reviewProposalSchema), aiController.reviewProposal);

export { router as aiRoutes };
