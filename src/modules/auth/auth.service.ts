import { prisma } from '@/config/database.js';
import { firebaseAuth } from '@/config/firebase.js';
import { AppError, NotFoundError, UnauthorizedError } from '@/common/errors/app-error.js';
import { StatusCodes } from 'http-status-codes';
import type { RegisterInput } from './auth.schema.js';
import { embedCompanyProfile } from '@/modules/matchmaking/matchmaking.service.js';

const FREE_TOKEN_QUOTA = 10; // token gratis saat signup

export const verifyFirebaseToken = async (idToken: string) => {
  try {
    return await firebaseAuth.verifyIdToken(idToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired Firebase token');
  }
};

export const registerUser = async (firebaseUid: string, email: string, input: RegisterInput) => {
  const existing = await prisma.user.findUnique({ where: { firebaseUid } });
  if (existing) {
    throw new AppError('User already registered', StatusCodes.CONFLICT);
  }

  const { user, companyProfileId } = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        firebaseUid,
        email,
        name: input.name,
        role: input.role,
        tokenBalance: FREE_TOKEN_QUOTA,
      },
    });

    let companyId: string | null = null;

    if (input.role === 'EO') {
      const { campus, description, ...required } = input.profile;
      await tx.eOProfile.create({
        data: {
          userId: newUser.id,
          ...required,
          ...(campus !== undefined && { campus }),
          ...(description !== undefined && { description }),
        },
      });
    } else {
      const { website, targetAudience, ...required } = input.profile;
      const created = await tx.companyProfile.create({
        data: {
          userId: newUser.id,
          ...required,
          ...(website !== undefined && { website }),
          ...(targetAudience !== undefined && { targetAudience }),
        },
      });
      companyId = created.id;
    }

    return { user: newUser, companyProfileId: companyId };
  });

  // Fire-and-forget: generate embedding untuk Company
  if (companyProfileId) {
    void embedCompanyProfile(companyProfileId);
  }

  return getUserWithProfile(user.id);
};

export const syncUser = async (firebaseUid: string) => {
  const user = await prisma.user.findUnique({ where: { firebaseUid } });
  if (!user) {
    throw new NotFoundError('User not registered. Please complete registration first');
  }
  if (!user.isActive) {
    throw new UnauthorizedError('Account is deactivated');
  }
  return getUserWithProfile(user.id);
};

export const getUserWithProfile = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      eoProfile: true,
      companyProfile: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  return user;
};

// Soft delete: set isActive = false.
export const deactivateUser = async (userId: string) => {
  return prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
  });
};
