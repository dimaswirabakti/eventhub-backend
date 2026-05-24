import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth } from '@/middlewares/auth.middleware.js';
import { messageListSchema, offerIdParamSchema, sendMessageSchema } from './messages.schema.js';
import * as messageController from './messages.controller.js';

// mergeParams: true supaya params ":offerId" dari parent route terbaca
const router: Router = Router({ mergeParams: true });

router.use(requireAuth);

router.post(
  '/',
  validate(offerIdParamSchema, 'params'),
  validate(sendMessageSchema),
  messageController.send
);

router.get(
  '/',
  validate(offerIdParamSchema, 'params'),
  validate(messageListSchema, 'query'),
  messageController.list
);

export { router as messagesRoutes };
