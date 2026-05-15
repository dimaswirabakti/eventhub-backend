import { prisma } from '@/config/database.js';
import { ForbiddenError, NotFoundError } from '@/common/errors/app-error.js';
import { embedCompanyProfile } from '@/modules/matchmaking/matchmaking.service.js';
import {
  parsePreferences,
  type CompanyPreferences,
} from '@/modules/matchmaking/preferences.types.js';
import type { UpdateCompanyProfileInput, UpdateEoProfileInput } from './profile.schema.js';
import type { Prisma } from '@prisma/client';

// HELPERS
// Bersihkan field undefined sebelum kirim ke Prisma.
const stripUndefined = <T extends Record<string, unknown>>(
  obj: T
): { [K in keyof T]: Exclude<T[K], undefined> } => {
  const result = {} as { [K in keyof T]: Exclude<T[K], undefined> };
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key] as Exclude<T[typeof key], undefined>;
    }
  }
  return result;
};

// UPDATE EO PROFILE
export const updateEoProfile = async (userId: string, input: UpdateEoProfileInput) => {
  const eoProfile = await prisma.eOProfile.findUnique({ where: { userId } });
  if (!eoProfile) {
    throw new ForbiddenError('EO profile not found. Wrong role?');
  }

  const { name, ...profileFields } = input;

  // Update User.name dan EOProfile dalam transaction
  const result = await prisma.$transaction(async (tx) => {
    if (name !== undefined) {
      await tx.user.update({
        where: { id: userId },
        data: { name },
      });
    }

    if (
      Object.keys(profileFields).some(
        (k) => profileFields[k as keyof typeof profileFields] !== undefined
      )
    ) {
      await tx.eOProfile.update({
        where: { userId },
        data: stripUndefined(profileFields),
      });
    }

    return tx.user.findUnique({
      where: { id: userId },
      include: { eoProfile: true },
    });
  });

  if (!result) throw new NotFoundError('User');
  return result;
};

// UPDATE COMPANY PROFILE
export const updateCompanyProfile = async (userId: string, input: UpdateCompanyProfileInput) => {
  const companyProfile = await prisma.companyProfile.findUnique({ where: { userId } });
  if (!companyProfile) {
    throw new ForbiddenError('Company profile not found. Wrong role?');
  }

  const { name, preferences, ...profileFields } = input;

  // Track apakah field embed-relevant berubah
  const embedRelevantFields: Array<keyof typeof profileFields> = [
    'companyName',
    'industry',
    'description',
    'targetAudience',
    'city',
  ];
  const hasEmbedRelevantChange =
    embedRelevantFields.some((field) => profileFields[field] !== undefined) ||
    preferences !== undefined;

  // Update dalam transaction
  const result = await prisma.$transaction(async (tx) => {
    if (name !== undefined) {
      await tx.user.update({
        where: { id: userId },
        data: { name },
      });
    }

    const profileUpdateData: Prisma.CompanyProfileUpdateInput = {
      ...stripUndefined(profileFields),
    };

    if (preferences !== undefined) {
      profileUpdateData.preferences = preferences;
    }

    if (Object.keys(profileUpdateData).length > 0) {
      await tx.companyProfile.update({
        where: { userId },
        data: profileUpdateData,
      });
    }

    return tx.user.findUnique({
      where: { id: userId },
      include: { companyProfile: true },
    });
  });

  if (!result) throw new NotFoundError('User');

  // Fire-and-forget: re-embed kalau ada field embed-relevant yang berubah
  if (hasEmbedRelevantChange) {
    void embedCompanyProfile(companyProfile.id);
  }

  return result;
};

// GET COMPANY PREFERENCES
export const getCompanyPreferences = async (userId: string): Promise<CompanyPreferences | null> => {
  const profile = await prisma.companyProfile.findUnique({
    where: { userId },
    select: { preferences: true },
  });

  if (!profile) {
    throw new ForbiddenError('Company profile not found. Wrong role?');
  }

  return parsePreferences(profile.preferences);
};
