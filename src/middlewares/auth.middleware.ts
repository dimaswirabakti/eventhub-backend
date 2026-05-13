import type { Request, Response, NextFunction } from 'express';
import { firebaseAuth } from '@/config/firebase.js';
import { prisma } from '@/config/database.js';
import { UnauthorizedError, ForbiddenError } from '@/common/errors/app-error.js';
import type { UserRole } from '@prisma/client';

// Extend Express Request type dengan user info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        firebaseUid: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

// Middleware: verifikasi Firebase token + load user dari DB.
export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const idToken = authHeader.substring(7); // hapus "Bearer "

    let decoded;
    try {
      decoded = await firebaseAuth.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    // Cek user di DB
    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
      select: { id: true, firebaseUid: true, email: true, role: true, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found. Please register first');
    }
    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated');
    }

    req.user = {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware lighter: hanya verifikasi Firebase token, tanpa cek DB.
 * Dipakai di endpoint /register (user belum ada di DB).
 */
export const requireFirebaseAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const idToken = authHeader.substring(7);

    let decoded;
    try {
      decoded = await firebaseAuth.verifyIdToken(idToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    if (!decoded.email) {
      throw new UnauthorizedError('Firebase token missing email');
    }

    // Attach minimal info, tanpa user.id (karena user belum exist di DB)
    req.user = {
      id: '', // akan diisi setelah register
      firebaseUid: decoded.uid,
      email: decoded.email,
      role: 'EO', // dummy, akan di-replace dari body request
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware: cek role.
 * Pakai setelah requireAuth.
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError(`Required role: ${allowedRoles.join(' or ')}`));
      return;
    }
    next();
  };
};
