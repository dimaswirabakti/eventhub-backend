import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth, requireFirebaseAuth } from '@/middlewares/auth.middleware.js';
import { registerSchema } from './auth.schema.js';
import * as authController from './auth.controller.js';
import { authRateLimiter } from '@/middlewares/rate-limit.middleware.js';

const router: Router = Router();

// [METHOD] {baseUrl}/api/v1/auth/{...}

// User sudah login di Firebase, sekarang lengkapi profile
router.post(
  '/register',
  authRateLimiter,
  requireFirebaseAuth,
  validate(registerSchema),
  authController.register
);

// Sync user yang sudah register dari Firebase ke local session
router.post('/login', authRateLimiter, requireAuth, authController.login);

// Get current user info
router.get('/me', requireAuth, authController.getMe);

// Soft delete akun
router.delete('/me', requireAuth, authController.deleteMe);

export { router as authRoutes };
