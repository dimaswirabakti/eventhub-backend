import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const offerIdParamSchema = z.object({
  offerId: z.string().cuid(),
});

export const messageListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type MessageListQuery = z.infer<typeof messageListSchema>;
