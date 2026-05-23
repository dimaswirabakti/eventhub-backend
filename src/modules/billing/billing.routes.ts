import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth } from '@/middlewares/auth.middleware.js';
import { topupSchema, transactionListSchema } from './billing.schema.js';
import * as billingController from './billing.controller.js';

const router: Router = Router();

// WEBHOOK (verified by Midtrans signature)
router.post('/webhook', billingController.webhook);

router.use(requireAuth);

router.get('/packages', billingController.listPackages);
router.get('/balance', billingController.getBalance);
router.post('/topup', validate(topupSchema), billingController.topup);
router.get(
  '/transactions',
  validate(transactionListSchema, 'query'),
  billingController.transactions
);
router.get('/usage', billingController.usage);

export { router as billingRoutes };
