import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware.js';
import { updateCompanyProfileSchema, updateEoProfileSchema } from './profile.schema.js';
import * as profileController from './profile.controller.js';

const router: Router = Router();

router.use(requireAuth);

// PATCH /profile/eo -> update EO profile
router.patch('/eo', requireRole('EO'), validate(updateEoProfileSchema), profileController.updateEo);

// PATCH /profile/company —> update Company profile (termasuk preferences)
router.patch(
  '/company',
  requireRole('COMPANY'),
  validate(updateCompanyProfileSchema),
  profileController.updateCompany
);

// GET /profile/company/preferences —> get current preferences
router.get('/company/preferences', requireRole('COMPANY'), profileController.getCompanyPreferences);

export { router as profileRoutes };
