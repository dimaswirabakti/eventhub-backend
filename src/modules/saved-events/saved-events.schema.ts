import { z } from 'zod';

// LIST QUERY
export const savedEventsListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// PARAMS
export const eventIdParamSchema = z.object({
  eventId: z.string().cuid(),
});

// TYPE EXPORTS
export type SavedEventsListQuery = z.infer<typeof savedEventsListSchema>;
