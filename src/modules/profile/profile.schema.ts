import { z } from 'zod';
import { isValidFirebaseStorageUrl } from '@/common/utils/storage.js';
import { companyPreferencesSchema } from '@/modules/matchmaking/preferences.types.js';

// Reusable: URL harus dari Firebase Storage bucket app ini
const firebaseStorageUrl = z.string().url().refine(isValidFirebaseStorageUrl, {
  message: 'URL must be from Firebase Storage bucket of this project',
});

// UPDATE EO PROFILE
export const updateEoProfileSchema = z.object({
  // User-level fields (di tabel User)
  name: z.string().min(2).max(100).optional(),

  // Profile-level fields (di tabel EOProfile)
  organizationName: z.string().min(2).max(100).optional(),
  organizationType: z.enum(['BEM', 'HIMA', 'UKM', 'COMMUNITY', 'OTHER']).optional(),
  campus: z.string().max(100).optional(),
  phoneNumber: z.string().min(10).max(20).optional(),
  city: z.string().min(2).max(50).optional(),
  description: z.string().max(1000).optional(),
  logoUrl: firebaseStorageUrl.optional(),
});

// UPDATE COMPANY PROFILE
export const updateCompanyProfileSchema = z.object({
  // User-level fields
  name: z.string().min(2).max(100).optional(),

  // Profile-level fields
  companyName: z.string().min(2).max(100).optional(),
  industry: z.string().min(2).max(50).optional(),
  description: z.string().min(10).max(1000).optional(),
  website: z.string().url().optional(),
  phoneNumber: z.string().min(10).max(20).optional(),
  city: z.string().min(2).max(50).optional(),
  targetAudience: z.string().max(500).optional(),
  logoUrl: firebaseStorageUrl.optional(),

  // Preferences
  preferences: companyPreferencesSchema.optional(),
});

// TYPE EXPORTS
export type UpdateEoProfileInput = z.infer<typeof updateEoProfileSchema>;
export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>;
