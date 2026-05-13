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

// CREATE OR UPDATE EVENT
export const createEventSchema = z
  .object({
    title: z.string().min(5).max(200),
    description: z.string().min(20).max(5000),
    category: eventCategoryEnum,
    theme: z.string().max(100).optional(),
    bannerUrl: z.string().url().optional(),

    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    city: z.string().min(2).max(50),
    venue: z.string().max(200).optional(),
    isOnline: z.boolean().default(false),

    expectedAttendees: z.number().int().positive(),
    audienceAgeMin: z.number().int().min(0).max(100),
    audienceAgeMax: z.number().int().min(0).max(100),
    audienceInterests: z.array(z.string().min(1).max(50)).min(1).max(10),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: 'endDate must be after or equal to startDate',
    path: ['endDate'],
  })
  .refine((data) => data.audienceAgeMax >= data.audienceAgeMin, {
    message: 'audienceAgeMax must be greater than or equal to audienceAgeMin',
    path: ['audienceAgeMax'],
  });

// Update: semua field optional, tapi pakai partial dari raw object schema
export const updateEventSchema = z.object({
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(20).max(5000).optional(),
  category: eventCategoryEnum.optional(),
  theme: z.string().max(100).optional(),
  bannerUrl: z.string().url().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  city: z.string().min(2).max(50).optional(),
  venue: z.string().max(200).optional(),
  isOnline: z.boolean().optional(),
  expectedAttendees: z.number().int().positive().optional(),
  audienceAgeMin: z.number().int().min(0).max(100).optional(),
  audienceAgeMax: z.number().int().min(0).max(100).optional(),
  audienceInterests: z.array(z.string().min(1).max(50)).min(1).max(10).optional(),
});

// SPONSORSHIP TIER
export const createTierSchema = z.object({
  name: z.string().min(2).max(50),
  price: z.number().int().min(0),
  benefits: z.array(z.string().min(1).max(200)).min(1).max(20),
  maxSlots: z.number().int().positive().default(1),
});

export const updateTierSchema = createTierSchema.partial();

// PROPOSAL
export const setProposalSchema = z
  .object({
    source: z.enum(['UPLOAD', 'GENERATED']),
    fileUrl: z.string().url().optional(),
    content: z.string().min(50).optional(),
  })
  .refine((data) => data.fileUrl || data.content, {
    message: 'Either fileUrl or content must be provided',
  });

// PUBLIC CATALOG FILTER (query string)
export const catalogFilterSchema = z.object({
  category: eventCategoryEnum.optional(),
  city: z.string().optional(),
  isOnline: z.coerce.boolean().optional(),
  minAttendees: z.coerce.number().int().min(0).optional(),
  maxAttendees: z.coerce.number().int().min(0).optional(),
  search: z.string().min(2).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

// URL PARAMS
export const eventIdParamSchema = z.object({
  id: z.string().cuid(),
});

export const tierIdParamSchema = z.object({
  id: z.string().cuid(),
  tierId: z.string().cuid(),
});

export const eventSlugParamSchema = z.object({
  slug: z.string().min(1),
});

// TYPE EXPORTS
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateTierInput = z.infer<typeof createTierSchema>;
export type UpdateTierInput = z.infer<typeof updateTierSchema>;
export type SetProposalInput = z.infer<typeof setProposalSchema>;
export type CatalogFilter = z.infer<typeof catalogFilterSchema>;
