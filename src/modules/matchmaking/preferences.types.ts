import { z } from 'zod';

const eventCategoryEnum = z.enum([
  'TECHNOLOGY',
  'BUSINESS',
  'ARTS',
  'SPORTS',
  'EDUCATION',
  'SOCIAL',
  'ENTERTAINMENT',
  'COMPETITION',
  'CONFERENCE',
  'WORKSHOP',
  'OTHER',
]);

// Zod schema untuk validasi CompanyPreferences.
export const companyPreferencesSchema = z
  .object({
    preferredCategories: z.array(eventCategoryEnum).max(11).default([]),
    preferredAudienceAgeMin: z.number().int().min(0).max(100).optional(),
    preferredAudienceAgeMax: z.number().int().min(0).max(100).optional(),
    preferredInterests: z.array(z.string().min(1).max(50)).max(20).default([]),
  })
  .refine(
    (data) => {
      if (data.preferredAudienceAgeMin && data.preferredAudienceAgeMax) {
        return data.preferredAudienceAgeMax >= data.preferredAudienceAgeMin;
      }
      return true;
    },
    {
      message: 'preferredAudienceAgeMax must be >= preferredAudienceAgeMin',
      path: ['preferredAudienceAgeMax'],
    }
  );

export type CompanyPreferences = z.infer<typeof companyPreferencesSchema>;

/**
 * Parse preferences dari Prisma JSON field,
 * Return null kalau data tidak valid atau kosong.
 */
export const parsePreferences = (data: unknown): CompanyPreferences | null => {
  if (!data || typeof data !== 'object') return null;
  const result = companyPreferencesSchema.safeParse(data);
  return result.success ? result.data : null;
};
