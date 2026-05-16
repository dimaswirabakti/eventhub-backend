import { z } from 'zod';

// CREATE OFFER (Company-initiated)
export const createOfferSchema = z.object({
  eventId: z.string().cuid(),
  tierId: z.string().cuid(),
  message: z.string().min(10).max(2000).optional(),
});

// CREATE PITCH (EO-initiated)
export const createPitchSchema = z.object({
  eventId: z.string().cuid(),
  companyProfileId: z.string().cuid(),
  tierId: z.string().cuid(),
  message: z.string().min(10).max(2000),
});

// REJECT
export const rejectOfferSchema = z.object({
  reason: z.string().max(500).optional(),
});

// LIST FILTER
export const offerListSchema = z.object({
  status: z
    .enum(['PENDING', 'UNDER_REVIEW', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'CANCELLED'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// PARAMS
export const offerIdParamSchema = z.object({
  id: z.string().cuid(),
});

// TYPE EXPORTS
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type CreatePitchInput = z.infer<typeof createPitchSchema>;
export type RejectOfferInput = z.infer<typeof rejectOfferSchema>;
export type OfferListQuery = z.infer<typeof offerListSchema>;
