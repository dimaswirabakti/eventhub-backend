import { z } from 'zod';

export const recommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  threshold: z.coerce.number().min(0).max(1).default(0.6),
});

export const eventIdParamSchema = z.object({
  eventId: z.string().cuid(),
});

export type RecommendationQuery = z.infer<typeof recommendationQuerySchema>;
