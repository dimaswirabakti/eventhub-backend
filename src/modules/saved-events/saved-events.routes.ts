import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware.js';
import { eventIdParamSchema, savedEventsListSchema } from './saved-events.schema.js';
import * as savedEventsController from './saved-events.controller.js';

const router: Router = Router();

router.use(requireAuth, requireRole('COMPANY'));

// GET /saved-events —> list all saved events
router.get('/', validate(savedEventsListSchema, 'query'), savedEventsController.list);

// POST /saved-events/:eventId —> save (idempotent)
router.post('/:eventId', validate(eventIdParamSchema, 'params'), savedEventsController.save);

// DELETE /saved-events/:eventId —> unsave (idempotent)
router.delete('/:eventId', validate(eventIdParamSchema, 'params'), savedEventsController.unsave);

export { router as savedEventsRoutes };
