import { Router } from 'express';
import { validate } from '@/middlewares/validate.middleware.js';
import { requireAuth, requireFirebaseAuth } from '@/middlewares/auth.middleware.js';
import { registerSchema } from './auth.schema.js';
import * as authController from './auth.controller.js';

const router: Router = Router();

// POST /api/v1/auth/register
// User sudah login di Firebase, sekarang lengkapi profile
router.post('/register', requireFirebaseAuth, validate(registerSchema), authController.register);

// POST /api/v1/auth/login
// Sync user yang sudah register dari Firebase ke local session
router.post('/login', requireAuth, authController.login);

// GET /api/v1/auth/me
// Get current user info
router.get('/me', requireAuth, authController.getMe);

// DELETE /api/v1/auth/me
// Soft delete akun
router.delete('/me', requireAuth, authController.deleteMe);

export { router as authRoutes };
